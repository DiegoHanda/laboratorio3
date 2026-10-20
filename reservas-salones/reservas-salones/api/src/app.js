import express from 'express';
import bcrypt from 'bcryptjs';
import { firmarToken, requireAuth, requireAdmin } from './auth.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pad = (n) => String(n).padStart(2, '0');

export function createApp(pool, config = {}) {
  const HORA_ABRE = Number(config.horaAbre ?? process.env.HORA_ABRE ?? 8);
  const HORA_CIERRA = Number(config.horaCierra ?? process.env.HORA_CIERRA ?? 22);
  const TZ_OFFSET = config.tzOffset ?? process.env.TZ_OFFSET ?? '-03:00'; // Montevideo
  const MAX_ACTIVAS = Number(config.maxReservasActivas ?? process.env.MAX_RESERVAS_ACTIVAS ?? 3);

  const instante = (fecha, hora) => new Date(`${fecha}T${pad(hora)}:00:00${TZ_OFFSET}`);
  const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !Number.isNaN(instante(f, 0).getTime());

  const app = express();
  app.use(express.json());

  app.get('/healthz', wrap(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  }));

  // ---- Autenticación ----
  app.post('/api/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = lower($1)', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    res.json({ token: firmarToken(u), usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
  }));

  // ---- Salones ----
  app.get('/api/salones', requireAuth, wrap(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM salones WHERE activo ORDER BY nombre');
    res.json(rows);
  }));

  const validarSalon = (b) => {
    const nombre = String(b?.nombre || '').trim();
    const capacidad = Number(b?.capacidad);
    if (!nombre) return 'El nombre es obligatorio';
    if (!Number.isInteger(capacidad) || capacidad <= 0) return 'La capacidad debe ser un entero positivo';
    return null;
  };

  app.post('/api/salones', requireAuth, requireAdmin, wrap(async (req, res) => {
    const error = validarSalon(req.body);
    if (error) return res.status(400).json({ error });
    const { nombre, capacidad, equipamiento } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO salones (nombre, capacidad, equipamiento) VALUES ($1, $2, $3) RETURNING *',
      [nombre.trim(), capacidad, equipamiento || '']
    );
    res.status(201).json(rows[0]);
  }));

  app.put('/api/salones/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const error = validarSalon(req.body);
    if (error) return res.status(400).json({ error });
    const { nombre, capacidad, equipamiento, activo } = req.body;
    const { rows } = await pool.query(
      `UPDATE salones SET nombre = $1, capacidad = $2, equipamiento = $3, activo = COALESCE($4, activo)
       WHERE id = $5 RETURNING *`,
      [nombre.trim(), capacidad, equipamiento || '', activo ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Salón no encontrado' });
    res.json(rows[0]);
  }));

  // ---- Disponibilidad por día y franja ----
  app.get('/api/disponibilidad', requireAuth, wrap(async (req, res) => {
    const { fecha } = req.query;
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'fecha debe ser YYYY-MM-DD' });
    const desde = instante(fecha, 0);
    const hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
    const [salones, reservas] = await Promise.all([
      pool.query('SELECT * FROM salones WHERE activo ORDER BY nombre'),
      pool.query(
        `SELECT salon_id, inicio, fin FROM reservas
         WHERE estado = 'activa' AND inicio >= $1 AND inicio < $2`,
        [desde, hasta]
      ),
    ]);
    const resultado = salones.rows.map((s) => {
      const franjas = [];
      for (let h = HORA_ABRE; h < HORA_CIERRA; h++) {
        const ini = instante(fecha, h);
        const fin = instante(fecha, h + 1);
        const ocupada = reservas.rows.some((r) => r.salon_id === s.id && r.inicio < fin && r.fin > ini);
        franjas.push({ hora: h, libre: !ocupada });
      }
      return { ...s, franjas };
    });
    res.json({ fecha, horaAbre: HORA_ABRE, horaCierra: HORA_CIERRA, salones: resultado });
  }));

  // ---- Reservas ----
  app.post('/api/reservas', requireAuth, wrap(async (req, res) => {
    const { salon_id, fecha, hora_inicio, hora_fin, grupo } = req.body || {};
    if (!Number.isInteger(salon_id)) return res.status(400).json({ error: 'salon_id inválido' });
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'fecha debe ser YYYY-MM-DD' });
    if (!Number.isInteger(hora_inicio) || !Number.isInteger(hora_fin) || hora_inicio >= hora_fin ||
        hora_inicio < HORA_ABRE || hora_fin > HORA_CIERRA) {
      return res.status(400).json({ error: `Franja inválida: entre ${HORA_ABRE}:00 y ${HORA_CIERRA}:00, horas enteras` });
    }
    const inicio = instante(fecha, hora_inicio);
    const fin = instante(fecha, hora_fin);
    if (inicio <= new Date()) return res.status(400).json({ error: 'No se puede reservar en el pasado' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa las reservas de una misma persona para que el límite no se esquive en paralelo.
      await client.query('SELECT pg_advisory_xact_lock($1)', [req.usuario.id]);
      const salon = await client.query('SELECT id FROM salones WHERE id = $1 AND activo', [salon_id]);
      if (!salon.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Salón no encontrado' });
      }
      if (req.usuario.rol === 'alumno') {
        const { rows } = await client.query(
          "SELECT count(*)::int AS n FROM reservas WHERE usuario_id = $1 AND estado = 'activa' AND fin > now()",
          [req.usuario.id]
        );
        if (rows[0].n >= MAX_ACTIVAS) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Alcanzaste el límite de ${MAX_ACTIVAS} reservas activas` });
        }
      }
      // La exclusión en la base es la que garantiza que no haya solapes, aun en paralelo.
      const { rows } = await client.query(
        `INSERT INTO reservas (salon_id, usuario_id, grupo, inicio, fin)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [salon_id, req.usuario.id, grupo?.trim() || null, inicio, fin]
      );
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }));

  const SELECT_RESERVAS = `
    SELECT r.id, r.salon_id, s.nombre AS salon, r.usuario_id, u.nombre AS usuario,
           r.grupo, r.inicio, r.fin, r.estado
    FROM reservas r
    JOIN salones s ON s.id = r.salon_id
    JOIN usuarios u ON u.id = r.usuario_id`;

  app.get('/api/reservas/mias', requireAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(`${SELECT_RESERVAS} WHERE r.usuario_id = $1 ORDER BY r.inicio DESC`, [req.usuario.id]);
    res.json(rows);
  }));

  app.get('/api/reservas', requireAuth, requireAdmin, wrap(async (_req, res) => {
    const { rows } = await pool.query(`${SELECT_RESERVAS} ORDER BY r.inicio DESC LIMIT 200`);
    res.json(rows);
  }));

  app.delete('/api/reservas/:id', requireAuth, wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM reservas WHERE id = $1', [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (r.usuario_id !== req.usuario.id && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo podés cancelar tus propias reservas' });
    }
    await pool.query("UPDATE reservas SET estado = 'cancelada' WHERE id = $1", [r.id]);
    res.status(204).end();
  }));

  // ---- Vista agregada (administración) ----
  app.get('/api/admin/ocupacion', requireAuth, requireAdmin, wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.nombre,
              count(r.id)::int AS reservas_futuras,
              COALESCE(sum(extract(epoch FROM (r.fin - r.inicio)) / 3600), 0)::float AS horas_reservadas
       FROM salones s
       LEFT JOIN reservas r ON r.salon_id = s.id AND r.estado = 'activa' AND r.fin > now()
       GROUP BY s.id ORDER BY s.nombre`
    );
    res.json(rows);
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.code === '23P01') return res.status(409).json({ error: 'El salón ya está reservado en esa franja' });
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}
