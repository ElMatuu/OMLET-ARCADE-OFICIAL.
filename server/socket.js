const { Server } = require('socket.io');
const { verifyToken } = require('./middleware/auth');
const Room = require('./models/Room');
const RoomMessage = require('./models/RoomMessage');
const Conversation = require('./models/Conversation');
const DirectMessage = require('./models/DirectMessage');
const Friendship = require('./models/Friendship');

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
      socket.data.userId = socket.user.sub;
      return next();
    } catch {
      return next(new Error('Sesión inválida'));
    }
  });

  io.on('connection', (socket) => {
    let messageWindowStart = Date.now();
    let messageCount = 0;


    socket.on('join_direct_conversation', async (payload, acknowledge = () => {}) => {
      const conversationId = payload && payload.conversationId;
      if (typeof conversationId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(conversationId)) {
        return acknowledge({ success: false, message: 'Conversación inválida.' });
      }
      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          $or: [{ participantA: socket.user.sub }, { participantB: socket.user.sub }]
        }).lean();
        if (!conversation) return acknowledge({ success: false, message: 'No tenés acceso a esta conversación.' });
        const otherId = String(conversation.participantA) === socket.user.sub
          ? conversation.participantB : conversation.participantA;
        const pairKey = [String(socket.user.sub), String(otherId)].sort().join(':');
        if (!(await Friendship.exists({ pairKey, status: 'accepted' }))) {
          return acknowledge({ success: false, message: 'La amistad ya no está activa.' });
        }
        await socket.join('dm:' + conversationId);
        return acknowledge({ success: true });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo validar el acceso al chat.' });
      }
    });

    socket.on('send_direct_message', async (payload, acknowledge = () => {}) => {
      const conversationId = payload && payload.conversationId;
      const body = typeof (payload && payload.body) === 'string' ? payload.body.trim() : '';
      if (typeof conversationId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(conversationId) ||
          !body || body.length > 2000 || !socket.rooms.has('dm:' + conversationId)) {
        return acknowledge({ success: false, message: 'Mensaje o conversación inválidos.' });
      }
      const now = Date.now();
      if (now - messageWindowStart >= 60 * 1000) {
        messageWindowStart = now;
        messageCount = 0;
      }
      if (messageCount >= 30) {
        return acknowledge({ success: false, message: 'Límite de mensajes alcanzado. Probá en un minuto.' });
      }
      messageCount += 1;
      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          $or: [{ participantA: socket.user.sub }, { participantB: socket.user.sub }]
        });
        if (!conversation) return acknowledge({ success: false, message: 'Conversación no encontrada.' });
        const recipientId = String(conversation.participantA) === socket.user.sub
          ? conversation.participantB : conversation.participantA;
        const pairKey = [String(socket.user.sub), String(recipientId)].sort().join(':');
        if (!(await Friendship.exists({ pairKey, status: 'accepted' }))) {
          await socket.leave('dm:' + conversationId);
          return acknowledge({ success: false, message: 'La amistad ya no está activa.' });
        }
        const saved = await DirectMessage.create({
          conversation: conversation._id,
          sender: socket.user.sub,
          senderUsername: socket.user.username,
          recipient: recipientId,
          body
        });
        conversation.lastMessage = body;
        conversation.lastMessageAt = saved.createdAt;
        conversation.lastMessageSender = socket.user.sub;
        await conversation.save();
        const message = {
          id: String(saved._id),
          conversationId,
          senderId: socket.user.sub,
          senderUsername: saved.senderUsername,
          recipientId: String(recipientId),
          body: saved.body,
          createdAt: saved.createdAt
        };
        io.to('dm:' + conversationId).emit('receive_direct_message', message);
        return acknowledge({ success: true, message });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo guardar el mensaje.' });
      }
    });

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

      const now = Date.now();
      if (now - messageWindowStart >= 60 * 1000) {
        messageWindowStart = now;
        messageCount = 0;
      }
      if (messageCount >= 30) {
        return acknowledge({ success: false, message: 'Límite de mensajes alcanzado. Probá en un minuto.' });
      }
      messageCount += 1;

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
