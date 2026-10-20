CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('alumno', 'admin'))
);

CREATE TABLE IF NOT EXISTS salones (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  capacidad    INTEGER NOT NULL CHECK (capacidad > 0),
  equipamiento TEXT NOT NULL DEFAULT '',
  activo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS reservas (
  id         SERIAL PRIMARY KEY,
  salon_id   INTEGER NOT NULL REFERENCES salones(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  grupo      TEXT,
  inicio     TIMESTAMPTZ NOT NULL,
  fin        TIMESTAMPTZ NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada')),
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fin > inicio),
  CONSTRAINT sin_solapes EXCLUDE USING gist (
    salon_id WITH =,
    tstzrange(inicio, fin) WITH &&
  ) WHERE (estado = 'activa')
);

CREATE INDEX IF NOT EXISTS reservas_usuario_idx ON reservas (usuario_id);
CREATE INDEX IF NOT EXISTS reservas_inicio_idx ON reservas (inicio);
