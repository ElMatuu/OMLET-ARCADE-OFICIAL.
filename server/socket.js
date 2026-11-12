const { Server } = require('socket.io');
const { verifyToken } = require('./middleware/auth');
const Room = require('./models/Room');
const RoomMessage = require('./models/RoomMessage');
const LiveStream = require('./models/LiveStream');
const Block = require('./models/Block');
const Conversation = require('./models/Conversation');
const GroupConversation = require('./models/GroupConversation');
const DirectMessage = require('./models/DirectMessage');
const Friendship = require('./models/Friendship');
const Notification = require('./models/Notification');
const UserPresence = require('./models/UserPresence');

const PRESENCE_TTL_MS = 70 * 1000;

async function refreshSocketPresence(socket) {
  const update = { $set: { user: socket.user.sub, expiresAt: new Date(Date.now() + PRESENCE_TTL_MS) } };
  try {
    return await UserPresence.findOneAndUpdate(
      { socketId: socket.id },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return UserPresence.findOneAndUpdate({ socketId: socket.id }, update, { new: true });
  }
}

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
    socket.join('user:' + String(socket.user.sub));
    refreshSocketPresence(socket).catch((error) => {
      console.error('Unable to register socket presence:', error.message);
    });
    socket.on('presence_heartbeat', async (payload, acknowledge = () => {}) => {
      if (typeof payload === 'function') acknowledge = payload;
      if (typeof acknowledge !== 'function') acknowledge = () => {};
      try {
        await refreshSocketPresence(socket);
        acknowledge({ success: true, expiresInMs: PRESENCE_TTL_MS });
      } catch (error) {
        acknowledge({ success: false, message: 'No se pudo actualizar tu presencia.' });
      }
    });
    socket.on('disconnect', () => {
      UserPresence.deleteOne({ socketId: socket.id }).catch((error) => {
        console.error('Unable to clear socket presence:', error.message);
      });
    });
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
        const [friendship, blocked] = await Promise.all([
          Friendship.exists({ pairKey, status: 'accepted' }),
          Block.exists({ $or: [{ blocker: socket.user.sub, blocked: otherId }, { blocker: otherId, blocked: socket.user.sub }] })
        ]);
        if (!friendship || blocked) return acknowledge({ success: false, message: 'La amistad ya no está activa.' });
        await socket.join('dm:' + conversationId);
        return acknowledge({ success: true });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo validar el acceso al chat.' });
      }
    });

    socket.on('join_group_conversation', async (payload, acknowledge = () => {}) => {
      const groupId = payload && payload.groupId;
      if (typeof groupId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
        return acknowledge({ success: false, message: 'Grupo inválido.' });
      }
      try {
        const group = await GroupConversation.exists({ _id: groupId, 'members.user': socket.user.sub, status: 'active' });
        if (!group) return acknowledge({ success: false, message: 'No tenés acceso a este grupo.' });
        await socket.join('group:' + groupId);
        return acknowledge({ success: true });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo validar el acceso al grupo.' });
      }
    });

    async function authorizeJoinedDirectConversation(conversationId) {
      if (typeof conversationId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(conversationId) ||
          !socket.rooms.has('dm:' + conversationId)) return null;
      const conversation = await Conversation.findOne({
        _id: conversationId,
        $or: [{ participantA: socket.user.sub }, { participantB: socket.user.sub }]
      }).lean();
      if (!conversation) return null;
      const otherId = String(conversation.participantA) === socket.user.sub
        ? conversation.participantB : conversation.participantA;
      const pairKey = [String(socket.user.sub), String(otherId)].sort().join(':');
      const [friendship, blocked] = await Promise.all([
        Friendship.exists({ pairKey, status: 'accepted' }),
        Block.exists({ $or: [{ blocker: socket.user.sub, blocked: otherId }, { blocker: otherId, blocked: socket.user.sub }] })
      ]);
      return friendship && !blocked ? conversation : null;
    }

    let lastTypingEventAt = 0;
    async function handleDirectTyping(payload, acknowledge, isTyping) {
      const conversationId = payload && payload.conversationId;
      try {
        const conversation = await authorizeJoinedDirectConversation(conversationId);
        if (!conversation) {
          if (typeof conversationId === 'string') await socket.leave('dm:' + conversationId);
          return acknowledge({ success: false, message: 'No tenés acceso a esta conversación.' });
        }
        const now = Date.now();
        if (isTyping && now - lastTypingEventAt < 250) {
          return acknowledge({ success: true, throttled: true });
        }
        if (isTyping) lastTypingEventAt = now;
        const event = isTyping ? 'direct_typing' : 'direct_typing_stopped';
        socket.to('dm:' + conversationId).emit(event, {
          conversationId,
          userId: String(socket.user.sub),
          username: socket.user.username
        });
        return acknowledge({ success: true });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo actualizar el estado de escritura.' });
      }
    }

    socket.on('direct_typing_start', (payload, acknowledge = () => {}) =>
      handleDirectTyping(payload, acknowledge, true));
    socket.on('direct_typing_stop', (payload, acknowledge = () => {}) =>
      handleDirectTyping(payload, acknowledge, false));

    socket.on('mark_direct_messages_read', async (payload, acknowledge = () => {}) => {
      const conversationId = payload && payload.conversationId;
      try {
        const conversation = await authorizeJoinedDirectConversation(conversationId);
        if (!conversation) {
          if (typeof conversationId === 'string') await socket.leave('dm:' + conversationId);
          return acknowledge({ success: false, message: 'No tenés acceso a esta conversación.' });
        }
        const unreadMessages = await DirectMessage.find({
          conversation: conversationId,
          recipient: socket.user.sub,
          readAt: null
        }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
        const readAt = new Date();
        if (unreadMessages.length) {
          await DirectMessage.updateMany(
            { conversation: conversationId, recipient: socket.user.sub, readAt: null },
            { $set: { readAt } }
          );
          await Conversation.updateOne(
            { _id: conversationId },
            { $set: { [String(conversation.participantA) === socket.user.sub ? 'unreadCountA' : 'unreadCountB']: 0 } }
          );
          io.to('dm:' + conversationId).emit('direct_messages_read', {
            conversationId,
            readerId: String(socket.user.sub),
            throughMessageId: String(unreadMessages[unreadMessages.length - 1]._id),
            readAt
          });
        }
        return acknowledge({ success: true, readCount: unreadMessages.length, readAt });
      } catch {
        return acknowledge({ success: false, message: 'No se pudieron marcar los mensajes como leídos.' });
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
        const [friendship, blocked] = await Promise.all([
          Friendship.exists({ pairKey, status: 'accepted' }),
          Block.exists({ $or: [{ blocker: socket.user.sub, blocked: recipientId }, { blocker: recipientId, blocked: socket.user.sub }] })
        ]);
        if (!friendship || blocked) {
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
        try {
          await Notification.create({
            recipient: recipientId,
            actor: socket.user.sub,
            type: 'direct_message',
            title: 'Nuevo mensaje privado',
            body: '@' + socket.user.username + ': ' + body.slice(0, 180),
            entityId: conversation._id
          });
        } catch (notificationError) {
          console.error('Unable to persist direct message notification:', notificationError.message);
        }
        await Conversation.updateOne(
          { _id: conversation._id },
          {
            $set: { lastMessage: body, lastMessageAt: saved.createdAt, lastMessageSender: socket.user.sub },
            $inc: { [String(conversation.participantA) === String(recipientId) ? 'unreadCountA' : 'unreadCountB']: 1 }
          }
        );
        const message = {
          id: String(saved._id),
          conversationId,
          senderId: socket.user.sub,
          senderUsername: saved.senderUsername,
          recipientId: String(recipientId),
          body: saved.body,
          createdAt: saved.createdAt,
          readAt: null
        };
        io.to('dm:' + conversationId).emit('receive_direct_message', message);
        io.to('user:' + String(recipientId)).emit('direct_message_notification', {
          conversationId,
          senderUsername: socket.user.username,
          body,
          createdAt: saved.createdAt
        });
        return acknowledge({ success: true, message });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo guardar el mensaje.' });
      }
    });

    socket.on('join_stream_chat', async (payload, acknowledge = () => {}) => {
      const streamId = payload && payload.streamId;
      if (typeof streamId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(streamId)) {
        return acknowledge({ success: false, message: 'Transmisión inválida.' });
      }
      try {
        const stream = await LiveStream.findOne({ _id: streamId, status: 'live' }).select('owner').lean();
        if (!stream) return acknowledge({ success: false, message: 'La transmisión ya no está disponible.' });
        if (String(stream.owner) !== String(socket.user.sub)) {
          const blocked = await Block.exists({ $or: [
            { blocker: socket.user.sub, blocked: stream.owner },
            { blocker: stream.owner, blocked: socket.user.sub }
          ] });
          if (blocked) return acknowledge({ success: false, message: 'No podés acceder al chat de esta transmisión.' });
        }
        await socket.join('stream-chat:' + streamId);
        return acknowledge({ success: true, streamId });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo validar el acceso al chat.' });
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

    socket.on('pin_room_message', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      const messageId = payload && payload.messageId;
      if (typeof roomId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(roomId) ||
          typeof messageId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(messageId) ||
          !socket.rooms.has(roomId)) {
        return acknowledge({ success: false, message: 'Sala o mensaje inválidos.' });
      }
      try {
        const room = await Room.findOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }], members: socket.user.sub, status: 'open' }).select('_id').lean();
        if (!room) return acknowledge({ success: false, message: 'Solo el anfitrión puede fijar mensajes.' });
        const target = await RoomMessage.findOne({ _id: messageId, room: roomId }).lean();
        if (!target) return acknowledge({ success: false, message: 'El mensaje ya no existe en esta sala.' });
        const pinnedAt = new Date();
        await Room.updateOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }], status: 'open' },
          { $set: { pinnedMessage: target._id, pinnedBy: socket.user.sub, pinnedAt } });
        const pinnedMessage = { id: String(target._id), username: target.username, message: target.message,
          sentAt: target.sentAt, pinnedBy: String(socket.user.sub), pinnedAt };
        io.to(roomId).emit('room_message_pinned', { roomId, pinnedMessage });
        return acknowledge({ success: true, pinnedMessage });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo fijar el mensaje.' });
      }
    });

    socket.on('unpin_room_message', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      if (typeof roomId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(roomId) || !socket.rooms.has(roomId)) {
        return acknowledge({ success: false, message: 'Sala inválida.' });
      }
      try {
        const room = await Room.findOneAndUpdate(
          { _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }], members: socket.user.sub, status: 'open' },
          { $set: { pinnedMessage: null, pinnedBy: null, pinnedAt: null } }, { new: true }
        ).select('_id').lean();
        if (!room) return acknowledge({ success: false, message: 'Solo el anfitrión puede quitar el mensaje fijado.' });
        io.to(roomId).emit('room_message_unpinned', { roomId });
        return acknowledge({ success: true });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo quitar el mensaje fijado.' });
      }
    });

    socket.on('mute_room_member', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      const targetUserId = payload && payload.userId;
      if (typeof roomId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(roomId) ||
          typeof targetUserId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(targetUserId) ||
          !socket.rooms.has(roomId)) return acknowledge({ success: false, message: 'Sala o participante inválidos.' });
      if (targetUserId === String(socket.user.sub)) return acknowledge({ success: false, message: 'No podés silenciarte a vos mismo.' });
      try {
        const room = await Room.findOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }], members: targetUserId, status: 'open' }).select('_id').lean();
        if (!room) return acknowledge({ success: false, message: 'Solo el anfitrión puede silenciar participantes.' });
        const mutedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await Room.updateOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }] }, { $pull: { mutedMembers: { user: targetUserId } } });
        await Room.updateOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }] }, { $push: { mutedMembers: { user: targetUserId, mutedBy: socket.user.sub, mutedUntil } } });
        io.to(roomId).emit('room_member_muted', { roomId, userId: targetUserId, mutedUntil });
        return acknowledge({ success: true, userId: targetUserId, mutedUntil });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo silenciar al participante.' });
      }
    });

    socket.on('unmute_room_member', async (payload, acknowledge = () => {}) => {
      const roomId = payload && payload.roomId;
      const targetUserId = payload && payload.userId;
      if (typeof roomId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(roomId) ||
          typeof targetUserId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(targetUserId) ||
          !socket.rooms.has(roomId)) return acknowledge({ success: false, message: 'Sala o participante inválidos.' });
      try {
        const room = await Room.findOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }], members: socket.user.sub, status: 'open' }).select('_id').lean();
        if (!room) return acknowledge({ success: false, message: 'No tenés permisos para quitar silencios.' });
        await Room.updateOne({ _id: roomId, $or: [{ owner: socket.user.sub }, { moderators: socket.user.sub }] }, { $pull: { mutedMembers: { user: targetUserId } } });
        io.to(roomId).emit('room_member_unmuted', { roomId, userId: targetUserId });
        return acknowledge({ success: true, userId: targetUserId });
      } catch {
        return acknowledge({ success: false, message: 'No se pudo quitar el silencio.' });
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
        }).select('_id mutedMembers').lean();
        if (!room) {
          await socket.leave(roomId);
          return acknowledge({ success: false, message: 'La sala está cerrada o ya no tenés acceso.' });
        }
        const activeMute = (room.mutedMembers || []).find((entry) =>
          String(entry.user) === String(socket.user.sub) && new Date(entry.mutedUntil) > new Date()
        );
        if (activeMute) return acknowledge({ success: false, message: 'El anfitrión silenció temporalmente tu chat en esta sala.' });
        const saved = await RoomMessage.create({
          room: room._id,
          author: socket.user.sub,
          username: socket.user.username,
          message: rawMessage.trim()
        });
        const message = {
          id: String(saved._id),
          authorId: String(saved.author),
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
