import jwt from 'jsonwebtoken';

function secret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET es obligatorio en producción');
  return 'dev-secret';
}

export function firmarToken(usuario) {
  return jwt.sign({ id: usuario.id, rol: usuario.rol, nombre: usuario.nombre }, secret(), { expiresIn: '12h' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });
  try {
    req.usuario = jwt.verify(token, secret());
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Solo administración' });
  next();
}
