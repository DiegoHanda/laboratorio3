import fs from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// pg lee PGHOST, PGUSER, PGPASSWORD, PGDATABASE y PGPORT del entorno;
// DATABASE_URL tiene prioridad si está definida.
export function createPool() {
  return new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
}

export async function waitForDb(pool, intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === intentos) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Idempotente y seguro con varias réplicas arrancando a la vez (lock consultivo).
export async function migrate(pool) {
  const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(sql);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

export async function ensureUser(pool, { nombre, email, password, rol }) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, lower($2), $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [nombre, email, hash, rol]
  );
}

// Crea el admin inicial (y datos de demo opcionales) a partir de variables de entorno.
export async function seed(pool) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, SEED_DEMO } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await ensureUser(pool, { nombre: 'Administración', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, rol: 'admin' });
  }
  if (SEED_DEMO === 'true') {
    await ensureUser(pool, { nombre: 'Alumno Demo', email: 'alumno@demo.test', password: 'alumno123', rol: 'alumno' });
    await pool.query(
      `INSERT INTO salones (nombre, capacidad, equipamiento) VALUES
         ('Salón 101', 30, 'Proyector, pizarra'),
         ('Salón 202', 12, 'TV, pizarra'),
         ('Laboratorio A', 20, 'PCs, proyector')
       ON CONFLICT (nombre) DO NOTHING`
    );
  }
}
