import { createPool, migrate, ensureUser } from '../src/db.js';
import { createApp } from '../src/app.js';

process.env.JWT_SECRET = 'secreto-de-test';

export async function arrancar(config = {}) {
  const pool = createPool(); // usa DATABASE_URL o las variables PG*
  await migrate(pool);
  await pool.query('TRUNCATE reservas, salones, usuarios RESTART IDENTITY CASCADE');
  const server = createApp(pool, config).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = async (metodo, ruta, { token, body } = {}) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const texto = await res.text();
    return { status: res.status, body: texto ? JSON.parse(texto) : null };
  };

  const crearUsuario = async (nombre, rol = 'alumno') => {
    const email = `${nombre.toLowerCase().replace(/\s+/g, '')}@test.uy`;
    await ensureUser(pool, { nombre, email, password: 'clave123', rol });
    const { body } = await api('POST', '/api/login', { body: { email, password: 'clave123' } });
    return body.token;
  };

  const cerrar = async () => {
    await new Promise((r) => server.close(r));
    await pool.end();
  };

  return { api, crearUsuario, cerrar };
}

// Una fecha futura (en 7 días) para que "no reservar en el pasado" no moleste.
export function fechaFutura(dias = 7) {
  return new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
}
