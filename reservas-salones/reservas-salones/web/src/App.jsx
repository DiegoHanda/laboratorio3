import { useCallback, useEffect, useState } from 'react';
import { api, sesion } from './api.js';
import { horaLabel, hoyISO, rangoLabel, rangoLibre } from './lib/format.js';

export default function App() {
  const [usuario, setUsuario] = useState(() => sesion.leer()?.usuario || null);
  const [vista, setVista] = useState('reservar');

  if (!usuario) return <Login onLogin={setUsuario} />;

  const esAdmin = usuario.rol === 'admin';
  const tabs = [
    ['reservar', 'Reservar'],
    ['mias', 'Mis reservas'],
    ...(esAdmin ? [['salones', 'Salones'], ['todas', 'Todas'], ['ocupacion', 'Ocupación']] : []),
  ];

  return (
    <div className='app'>
      <header>
        <strong>Reserva de salones</strong>
        <span>
          {usuario.nombre} ({usuario.rol}){' '}
          <button className='link' onClick={() => { sesion.borrar(); setUsuario(null); }}>Salir</button>
        </span>
      </header>
      <nav>
        {tabs.map(([id, texto]) => (
          <button key={id} className={vista === id ? 'tab activa' : 'tab'} onClick={() => setVista(id)}>{texto}</button>
        ))}
      </nav>
      <main>
        {vista === 'reservar' && <Reservar />}
        {vista === 'mias' && <ListaReservas ruta='/reservas/mias' />}
        {vista === 'salones' && esAdmin && <Salones />}
        {vista === 'todas' && esAdmin && <ListaReservas ruta='/reservas' mostrarUsuario />}
        {vista === 'ocupacion' && esAdmin && <Ocupacion />}
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const entrar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const s = await api('POST', '/login', { email, password });
      sesion.guardar(s);
      onLogin(s.usuario);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className='app login'>
      <h1>Reserva de salones</h1>
      <form onSubmit={entrar}>
        <label>Email<input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Contraseña<input type='password' value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className='error'>{error}</p>}
        <button className='primario'>Entrar</button>
      </form>
    </div>
  );
}

function Reservar() {
  const [fecha, setFecha] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(null); // { salonId, desde, hasta (excluida) }
  const [grupo, setGrupo] = useState('');
  const [msg, setMsg] = useState(null); // { tipo, texto }

  const cargar = useCallback(async () => {
    try {
      setDatos(await api('GET', `/disponibilidad?fecha=${fecha}`));
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    }
  }, [fecha]);

  useEffect(() => { setSel(null); cargar(); }, [cargar]);

  const elegir = (salon, hora) => {
    setMsg(null);
    if (sel && sel.salonId === salon.id) {
      if (hora === sel.desde && sel.hasta === sel.desde + 1) return setSel(null);
      if (hora >= sel.desde && rangoLibre(salon.franjas, sel.desde, hora + 1)) return setSel({ ...sel, hasta: hora + 1 });
    }
    setSel({ salonId: salon.id, desde: hora, hasta: hora + 1 });
  };

  const reservar = async () => {
    try {
      await api('POST', '/reservas', {
        salon_id: sel.salonId, fecha, hora_inicio: sel.desde, hora_fin: sel.hasta, grupo: grupo || undefined,
      });
      setMsg({ tipo: 'ok', texto: 'Reserva confirmada' });
      setSel(null);
      setGrupo('');
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    }
    cargar();
  };

  const salonSel = datos?.salones.find((s) => s.id === sel?.salonId);

  return (
    <section>
      <label>Día<input type='date' value={fecha} min={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
      {msg && <p className={msg.tipo === 'ok' ? 'ok' : 'error'}>{msg.texto}</p>}
      {datos?.salones.length === 0 && <p>Todavía no hay salones cargados.</p>}
      {datos?.salones.map((s) => (
        <article key={s.id} className='tarjeta'>
          <h3>{s.nombre}</h3>
          <p className='detalle'>Capacidad {s.capacidad}{s.equipamiento ? ` · ${s.equipamiento}` : ''}</p>
          <div className='franjas'>
            {s.franjas.map((f) => {
              const activa = sel?.salonId === s.id && f.hora >= sel.desde && f.hora < sel.hasta;
              return (
                <button key={f.hora} disabled={!f.libre} className={activa ? 'franja activa' : 'franja'} onClick={() => elegir(s, f.hora)}>
                  {horaLabel(f.hora)}
                </button>
              );
            })}
          </div>
        </article>
      ))}
      {sel && salonSel && (
        <div className='barra'>
          <div>
            <strong>{salonSel.nombre}</strong> · {horaLabel(sel.desde)}–{horaLabel(sel.hasta)}
            <input placeholder='Nombre del grupo (opcional)' value={grupo} onChange={(e) => setGrupo(e.target.value)} />
          </div>
          <button className='primario' onClick={reservar}>Reservar</button>
        </div>
      )}
    </section>
  );
}

function ListaReservas({ ruta, mostrarUsuario }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => api('GET', ruta).then(setFilas).catch((e) => setError(e.message)), [ruta]);
  useEffect(() => { cargar(); }, [cargar]);

  const cancelar = async (id) => {
    try {
      await api('DELETE', `/reservas/${id}`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!filas) return <p>{error || 'Cargando…'}</p>;
  if (filas.length === 0) return <p>No hay reservas.</p>;
  return (
    <section>
      {error && <p className='error'>{error}</p>}
      {filas.map((r) => (
        <article key={r.id} className={r.estado === 'activa' ? 'tarjeta' : 'tarjeta cancelada'}>
          <h3>{r.salon}</h3>
          <p>{rangoLabel(r.inicio, r.fin)}</p>
          <p className='detalle'>
            {r.grupo ? `Grupo: ${r.grupo}` : 'A nombre propio'}
            {mostrarUsuario ? ` · ${r.usuario}` : ''} · {r.estado}
          </p>
          {r.estado === 'activa' && new Date(r.fin) > new Date() && (
            <button onClick={() => cancelar(r.id)}>Cancelar</button>
          )}
        </article>
      ))}
    </section>
  );
}

function Salones() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nombre: '', capacidad: '', equipamiento: '' });
  const [error, setError] = useState('');

  const cargar = () => api('GET', '/salones').then(setLista).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('POST', '/salones', { ...form, capacidad: Number(form.capacidad) });
      setForm({ nombre: '', capacidad: '', equipamiento: '' });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <form onSubmit={crear} className='tarjeta'>
        <h3>Nuevo salón</h3>
        <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label>Capacidad<input type='number' min='1' value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} required /></label>
        <label>Equipamiento<input value={form.equipamiento} onChange={(e) => setForm({ ...form, equipamiento: e.target.value })} /></label>
        {error && <p className='error'>{error}</p>}
        <button className='primario'>Agregar</button>
      </form>
      {lista.map((s) => (
        <article key={s.id} className='tarjeta'>
          <h3>{s.nombre}</h3>
          <p className='detalle'>Capacidad {s.capacidad}{s.equipamiento ? ` · ${s.equipamiento}` : ''}</p>
        </article>
      ))}
    </section>
  );
}

function Ocupacion() {
  const [filas, setFilas] = useState(null);
  useEffect(() => { api('GET', '/admin/ocupacion').then(setFilas).catch(() => setFilas([])); }, []);
  if (!filas) return <p>Cargando…</p>;
  return (
    <table>
      <thead><tr><th>Salón</th><th>Reservas futuras</th><th>Horas</th></tr></thead>
      <tbody>
        {filas.map((f) => <tr key={f.id}><td>{f.nombre}</td><td>{f.reservas_futuras}</td><td>{f.horas_reservadas}</td></tr>)}
      </tbody>
    </table>
  );
}
