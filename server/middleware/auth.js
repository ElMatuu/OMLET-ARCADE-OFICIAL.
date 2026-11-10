const jwt = require('jsonwebtoken');

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Autenticación requerida' });
  }

  try {
    req.auth = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Sesión inválida o vencida' });
  }
}

module.exports = { requireAuth, verifyToken };
