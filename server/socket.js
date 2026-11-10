const { Server } = require('socket.io');
const { verifyToken } = require('./middleware/auth');

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
const MESSAGE_MAX_LENGTH = 1000;

function attachSocketServer(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1e6
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Autenticación requerida'));
      socket.user = verifyToken(token);
      return next();
    } catch {
      return next(new Error('Sesión inválida'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_room', (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId)) {
        return acknowledge({ success: false, message: 'Identificador de sala inválido' });
      }
      socket.join(roomId);
      return acknowledge({ success: true, roomId });
    });

    socket.on('send_message', (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      const rawMessage = payload && payload.message;
      if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId) ||
          typeof rawMessage !== 'string' || !rawMessage.trim() ||
          rawMessage.length > MESSAGE_MAX_LENGTH || !socket.rooms.has(roomId)) {
        return acknowledge({ success: false, message: 'Mensaje o sala inválidos' });
      }

      const message = {
        roomId,
        username: socket.user.username,
        message: rawMessage.trim(),
        sentAt: new Date().toISOString()
      };
      socket.to(roomId).emit('receive_message', message);
      return acknowledge({ success: true, message });
    });
  });

  return io;
}

module.exports = { attachSocketServer };
