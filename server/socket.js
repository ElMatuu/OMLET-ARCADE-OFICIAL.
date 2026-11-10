const { Server } = require('socket.io');
const { verifyToken } = require('./middleware/auth');
const Room = require('./models/Room');
const RoomMessage = require('./models/RoomMessage');

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
    socket.on('join_room', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId)) {
        return acknowledge({ success: false, message: 'Identificador de sala inválido' });
      }
      try {
        const membership = await Room.exists({
          _id: roomId,
          members: socket.user.sub,
          status: 'open'
        });
        if (!membership) {
          return acknowledge({ success: false, message: 'No pertenecés a esta sala.' });
        }
        await socket.join(roomId);
        return acknowledge({ success: true, roomId });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo validar el acceso a la sala.' });
      }
    });

    socket.on('send_message', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      const rawMessage = payload && payload.message;
      if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId) ||
          typeof rawMessage !== 'string' || !rawMessage.trim() ||
          rawMessage.length > MESSAGE_MAX_LENGTH || !socket.rooms.has(roomId)) {
        return acknowledge({ success: false, message: 'Mensaje o sala inválidos' });
      }

      try {
        const room = await Room.findOne({
          _id: roomId,
          members: socket.user.sub,
          status: 'open'
        }).select('_id').lean();
        if (!room) {
          await socket.leave(roomId);
          return acknowledge({ success: false, message: 'La sala está cerrada o ya no tenés acceso.' });
        }
        const saved = await RoomMessage.create({
          room: room._id,
          author: socket.user.sub,
          username: socket.user.username,
          message: rawMessage.trim()
        });
        const message = {
          id: String(saved._id),
          username: saved.username,
          message: saved.message,
          sentAt: saved.sentAt
        };
        io.to(roomId).emit('receive_message', message);
        return acknowledge({ success: true, message });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo guardar el mensaje.' });
      }
    });
  });

  return io;
}

module.exports = { attachSocketServer };
