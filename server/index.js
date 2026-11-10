require('dotenv').config();

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const User = require('./models/User');
const Room = require('./models/Room');
const { requireAuth } = require('./middleware/auth');
const { attachSocketServer } = require('./socket');

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure it.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Probá más tarde.' }
});

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '2h', issuer: 'playverse-api', audience: 'playverse-clients' }
  );
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'PLAYVERSE API',
    status: mongoose.connection.readyState === 1 ? 'ready' : 'database-disconnected'
  });
});

app.post('/api/register', authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'El usuario debe tener 3-24 caracteres: letras, números o _.' });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener entre 12 y 128 caracteres.' });
    }

    const existing = await User.findOne({ username }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });
    return res.status(201).json({
      success: true,
      token: issueToken(user),
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está registrado.' });
    }
    return next(error);
  }
});

app.post('/api/login', authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Completá usuario y contraseña.' });
    }

    const user = await User.findOne({ username }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }

    return res.json({
      success: true,
      token: issueToken(user),
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('username role createdAt').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({ success: true, user: { id: String(user._id), username: user.username, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const rooms = await Room.find({ visibility: 'public', status: 'open' })
      .select('name game ownerUsername memberCount capacity createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ success: true, rooms });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const game = typeof req.body.game === 'string' ? req.body.game.trim() : '';
    if (name.length < 3 || name.length > 60 || game.length < 2 || game.length > 40) {
      return res.status(400).json({ success: false, message: 'El nombre de sala (3-60) y el juego (2-40) son obligatorios.' });
    }
    const room = await Room.create({
      name,
      game,
      owner: req.auth.sub,
      ownerUsername: req.auth.username,
      members: [req.auth.sub],
      memberCount: 1
    });
    return res.status(201).json({
      success: true,
      room: {
        id: String(room._id),
        name: room.name,
        game: room.game,
        ownerUsername: room.ownerUsername,
        memberCount: room.memberCount,
        capacity: room.capacity
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms/:roomId/join', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const room = await Room.findOneAndUpdate(
      {
        _id: req.params.roomId,
        visibility: 'public',
        status: 'open',
        $or: [
          { members: req.auth.sub },
          { $expr: { $lt: ['$memberCount', '$capacity'] } }
        ]
      },
      { $addToSet: { members: req.auth.sub }, $inc: { memberCount: 1 } },
      { new: true, runValidators: true }
    ).select('name game ownerUsername members memberCount capacity').lean();

    if (!room) {
      return res.status(404).json({ success: false, message: 'Sala no disponible o completa.' });
    }
    const alreadyMember = room.members.some((id) => String(id) === String(req.auth.sub));
    if (!alreadyMember) {
      return res.status(409).json({ success: false, message: 'No se pudo confirmar tu membresía.' });
    }
    return res.json({
      success: true,
      room: {
        id: String(room._id),
        name: room.name,
        game: room.game,
        ownerUsername: room.ownerUsername,
        memberCount: room.memberCount,
        capacity: room.capacity
      }
    });
  } catch (error) {
    return next(error);
  }
});


app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('API error:', error.message);
  return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  attachSocketServer(httpServer, allowedOrigins);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PLAYVERSE API listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Unable to start PLAYVERSE API:', error.message);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await mongoose.disconnect();
  httpServer.close(() => process.exit(0));
});
