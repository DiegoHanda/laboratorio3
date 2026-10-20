import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar, fechaFutura } from './helpers.js';

let t, admin, ana, beto, salonId;
const fecha = fechaFutura();

before(async () => {
  t = await arrancar({ maxReservasActivas: 3 });
  await preparar();
});
after(async () => t.cerrar());

async function preparar() {
  const { api } = t;
  admin = await t.crearUsuario('Admin', 'admin');
  ana = await t.crearUsuario('Ana');
  beto = await t.crearUsuario('Beto');
  const r = await api('POST', '/api/salones', {
    token: admin,
    body: { nombre: `Salón ${Math.random().toString(36).slice(2, 7)}`, capacidad: 30, equipamiento: 'Proyector' },
  });
  assert.equal(r.status, 201);
  salonId = r.body.id;
}

const reservar = (token, hora_inicio, hora_fin, extra = {}) =>
  t.api('POST', '/api/reservas', { token, body: { salon_id: salonId, fecha, hora_inicio, hora_fin, ...extra } });

test('login correcto e incorrecto', async () => {
  const ok = await t.api('POST', '/api/login', { body: { email: 'ana@test.uy', password: 'clave123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.usuario.rol, 'alumno');
  const mal = await t.api('POST', '/api/login', { body: { email: 'ana@test.uy', password: 'otra' } });
  assert.equal(mal.status, 401);
  const sinToken = await t.api('GET', '/api/salones');
  assert.equal(sinToken.status, 401);
});

test('un alumno no puede cargar salones; administración sí', async () => {
  const r = await t.api('POST', '/api/salones', { token: ana, body: { nombre: 'X', capacidad: 10 } });
  assert.equal(r.status, 403);
});

test('dos reservas no pueden solaparse en el mismo salón, pero las contiguas sí', async () => {
  const a = await reservar(ana, 10, 12);
  assert.equal(a.status, 201);
  const solapada = await reservar(beto, 11, 13);
  assert.equal(solapada.status, 409);
  const contigua = await reservar(beto, 12, 13);
  assert.equal(contigua.status, 201);
});

test('la disponibilidad marca las franjas ocupadas', async () => {
  const r = await t.api('GET', `/api/disponibilidad?fecha=${fecha}`, { token: ana });
  assert.equal(r.status, 200);
  const franjas = r.body.salones.find((s) => s.id === salonId).franjas;
  assert.equal(franjas.find((f) => f.hora === 10).libre, false);
  assert.equal(franjas.find((f) => f.hora === 11).libre, false);
  assert.equal(franjas.find((f) => f.hora === 14).libre, true);
});

test('muchas reservas simultáneas de la misma franja: solo una gana', async () => {
  const tokens = [];
  for (let i = 0; i < 8; i++) tokens.push(await t.crearUsuario(`Concurrente ${i}`));
  const resultados = await Promise.all(tokens.map((tk) => reservar(tk, 18, 19)));
  const estados = resultados.map((r) => r.status).sort();
  assert.equal(estados.filter((s) => s === 201).length, 1);
  assert.equal(estados.filter((s) => s === 409).length, 7);
});

test('cancelar libera la franja; un alumno no cancela reservas ajenas, administración sí', async () => {
  const r = await reservar(ana, 15, 16, { grupo: 'Grupo Tesis' });
  assert.equal(r.status, 201);
  assert.equal(r.body.grupo, 'Grupo Tesis');

  const ajena = await t.api('DELETE', `/api/reservas/${r.body.id}`, { token: beto });
  assert.equal(ajena.status, 403);

  const propia = await t.api('DELETE', `/api/reservas/${r.body.id}`, { token: ana });
  assert.equal(propia.status, 204);

  const otra = await reservar(beto, 15, 16);
  assert.equal(otra.status, 201);
  const admCancela = await t.api('DELETE', `/api/reservas/${otra.body.id}`, { token: admin });
  assert.equal(admCancela.status, 204);

  const mias = await t.api('GET', '/api/reservas/mias', { token: ana });
  assert.ok(mias.body.some((x) => x.id === r.body.id && x.estado === 'cancelada'));
});

test('límite de reservas activas por persona, también en paralelo', async () => {
  const carla = await t.crearUsuario('Carla');
  const resultados = await Promise.all([8, 9, 10, 11, 12].map((h) => reservarOtroDia(carla, h)));
  const creadas = resultados.filter((r) => r.status === 201).length;
  assert.equal(creadas, 3);
});

// usa otro día para no chocar con las reservas de los tests anteriores
const reservarOtroDia = (token, h) =>
  t.api('POST', '/api/reservas', {
    token,
    body: { salon_id: salonId, fecha: fechaFutura(9), hora_inicio: h, hora_fin: h + 1 },
  });

test('valida franjas fuera de horario y fechas pasadas', async () => {
  const fuera = await reservar(ana, 6, 7);
  assert.equal(fuera.status, 400);
  const pasada = await t.api('POST', '/api/reservas', {
    token: ana,
    body: { salon_id: salonId, fecha: '2020-01-01', hora_inicio: 10, hora_fin: 11 },
  });
  assert.equal(pasada.status, 400);
});

test('administración ve la ocupación agregada', async () => {
  const r = await t.api('GET', '/api/admin/ocupacion', { token: admin });
  assert.equal(r.status, 200);
  assert.ok(r.body[0].reservas_futuras >= 1);
  const prohibido = await t.api('GET', '/api/admin/ocupacion', { token: ana });
  assert.equal(prohibido.status, 403);
});
