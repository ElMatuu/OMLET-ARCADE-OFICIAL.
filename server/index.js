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
const Post = require('./models/Post');
const Comment = require('./models/Comment');
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
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
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

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Publicaste demasiado rápido. Probá más tarde.' }
});

app.get('/api/posts', requireAuth, async (req, res, next) => {
  try {
    const filter = {};
    const before = typeof req.query.before === 'string' ? req.query.before : '';
    if (before) {
      if (before.length > 256) {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      let cursor;
      try {
        cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      const cursorDate = cursor && typeof cursor.createdAt === 'string' ? new Date(cursor.createdAt) : null;
      if (!cursor || !mongoose.isValidObjectId(cursor.id) ||
          !cursorDate || Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      filter.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ];
    }

    const fetchedPosts = await Post.find(filter)
      .select('authorUsername content likes commentCount createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(31)
      .lean();
    const hasMore = fetchedPosts.length > 30;
    const posts = fetchedPosts.slice(0, 30);
    return res.json({
      success: true,
      hasMore,
      nextCursor: hasMore && posts.length ? Buffer.from(JSON.stringify({
        createdAt: posts[posts.length - 1].createdAt.toISOString(),
        id: String(posts[posts.length - 1]._id)
      })).toString('base64url') : null,
      posts: posts.map((post) => ({
        id: String(post._id),
        authorUsername: post.authorUsername,
        content: post.content,
        likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
        likedByMe: Array.isArray(post.likes) && post.likes.some((id) => String(id) === req.auth.sub),
        commentCount: Number(post.commentCount) || 0,
        createdAt: post.createdAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/posts', requireAuth, postLimiter, async (req, res, next) => {
  try {
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'La publicación debe tener entre 1 y 2000 caracteres.'
      });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    const post = await Post.create({
      author: req.auth.sub,
      authorUsername: user.username,
      content
    });
    return res.status(201).json({
      success: true,
      post: {
        id: String(post._id),
        authorUsername: post.authorUsername,
        content: post.content,
        likeCount: 0,
        likedByMe: false,
        commentCount: 0,
        createdAt: post.createdAt
      }
    });
  } catch (error) {
    return next(error);
  }
});


app.put('/api/posts/:postId', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({ success: false, message: 'La publicación debe tener entre 1 y 2000 caracteres.' });
    }
    const post = await Post.findOneAndUpdate(
      { _id: req.params.postId, author: req.auth.sub },
      { $set: { content } },
      { new: true, runValidators: true }
    ).select('authorUsername content likes commentCount createdAt').lean();
    if (!post) {
      const exists = await Post.exists({ _id: req.params.postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien publicó puede editar esta publicación.' : 'Publicación no encontrada.'
      });
    }
    return res.json({ success: true, post: {
      id: String(post._id),
      authorUsername: post.authorUsername,
      content: post.content,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: Array.isArray(post.likes) && post.likes.some((id) => String(id) === req.auth.sub),
      commentCount: Number(post.commentCount) || 0,
      createdAt: post.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const session = await mongoose.startSession();
    let post;
    try {
      await session.withTransaction(async () => {
        post = await Post.findOneAndDelete({
          _id: req.params.postId,
          author: req.auth.sub
        }).session(session);
        if (post) await Comment.deleteMany({ post: post._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!post) {
      const exists = await Post.exists({ _id: req.params.postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien publicó puede eliminar esta publicación.' : 'Publicación no encontrada.'
      });
    }
    return res.json({ success: true, deletedPostId: String(post._id) });
  } catch (error) {
    return next(error);
  }
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Comentaste demasiado rápido. Probá más tarde.' }
});

app.put('/api/posts/:postId/like', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $addToSet: { likes: req.auth.sub } },
      { new: true }
    ).select('likes commentCount').lean();
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.json({
      success: true,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: true
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId/like', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $pull: { likes: req.auth.sub } },
      { new: true }
    ).select('likes').lean();
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.json({
      success: true,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: false
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/posts/:postId/comments', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const exists = await Post.exists({ _id: req.params.postId });
    if (!exists) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    const comments = await Comment.find({ post: req.params.postId })
      .select('authorUsername content createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .limit(50)
      .lean();
    return res.json({ success: true, comments: comments.map((comment) => ({
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    })) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/posts/:postId/comments', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 1000) {
      return res.status(400).json({ success: false, message: 'El comentario debe tener entre 1 y 1000 caracteres.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    const session = await mongoose.startSession();
    let comment;
    try {
      await session.withTransaction(async () => {
        const post = await Post.findById(req.params.postId).select('_id').session(session);
        if (!post) return;
        const created = await Comment.create([{
          post: post._id,
          author: req.auth.sub,
          authorUsername: user.username,
          content
        }], { session });
        comment = created[0];
        await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!comment) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.status(201).json({ success: true, comment: {
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});


app.put('/api/posts/:postId/comments/:commentId', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    if (!mongoose.isValidObjectId(postId) || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 1000) {
      return res.status(400).json({ success: false, message: 'El comentario debe tener entre 1 y 1000 caracteres.' });
    }
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, post: postId, author: req.auth.sub },
      { $set: { content } },
      { new: true, runValidators: true }
    ).select('authorUsername content createdAt').lean();
    if (!comment) {
      const exists = await Comment.exists({ _id: commentId, post: postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien comentó puede editar este comentario.' : 'Comentario no encontrado.'
      });
    }
    return res.json({ success: true, comment: {
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId/comments/:commentId', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    if (!mongoose.isValidObjectId(postId) || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    const session = await mongoose.startSession();
    let comment;
    try {
      await session.withTransaction(async () => {
        comment = await Comment.findOneAndDelete({
          _id: commentId,
          post: postId,
          author: req.auth.sub
        }).session(session);
        if (comment) {
          await Post.updateOne(
            { _id: postId, commentCount: { $gt: 0 } },
            { $inc: { commentCount: -1 } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }
    if (!comment) {
      const exists = await Comment.exists({ _id: commentId, post: postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien comentó puede eliminar este comentario.' : 'Comentario no encontrado.'
      });
    }
    return res.json({ success: true, deletedCommentId: String(comment._id) });
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
    const existingMembership = await Room.findOne({
      _id: req.params.roomId,
      members: req.auth.sub,
      visibility: 'public',
      status: 'open'
    }).select('name game ownerUsername memberCount capacity').lean();

    if (existingMembership) {
      return res.json({
        success: true,
        room: {
          id: String(existingMembership._id),
          name: existingMembership.name,
          game: existingMembership.game,
          ownerUsername: existingMembership.ownerUsername,
          memberCount: existingMembership.memberCount,
          capacity: existingMembership.capacity
        }
      });
    }

    const room = await Room.findOneAndUpdate(
      {
        _id: req.params.roomId,
        visibility: 'public',
        status: 'open',
        members: { $ne: req.auth.sub },
        $expr: { $lt: ['$memberCount', '$capacity'] }
      },
      { $addToSet: { members: req.auth.sub }, $inc: { memberCount: 1 } },
      { new: true, runValidators: true }
    ).select('name game ownerUsername memberCount capacity').lean();

    if (!room) {
      return res.status(404).json({ success: false, message: 'Sala no disponible o completa.' });
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
