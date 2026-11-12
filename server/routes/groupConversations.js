const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const GroupConversation = require('../models/GroupConversation');
const GroupMessage = require('../models/GroupMessage');
const Notification = require('../models/Notification');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const validId = value => mongoose.isValidObjectId(value);
const memberOf = (conversation, userId) => conversation.members.find(member => String(member.user) === String(userId));
const serialize = message => ({ id: String(message._id), conversationId: String(message.conversation), senderId: String(message.sender), senderUsername: message.senderUsername, body: message.body, createdAt: message.createdAt, editedAt: message.editedAt || null });

router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try {
    const groups = await GroupConversation.find({ 'members.user': req.auth.sub, status: 'active' })
      .sort({ lastMessageAt: -1 }).limit(100).lean();
    return res.json({ success: true, groups: groups.map(group => ({
      id: String(group._id), name: group.name, description: group.description,
      memberCount: group.members.length, role: (group.members.find(m => String(m.user) === req.auth.sub) || {}).role,
      lastMessage: group.lastMessage, lastMessageAt: group.lastMessageAt
    })) });
  } catch (error) { return next(error); }
});

router.post('/', limiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const usernames = Array.isArray(req.body.usernames) ? [...new Set(req.body.usernames.filter(v => typeof v === 'string').map(v => v.trim().replace(/^@/, '')).filter(v => /^[a-zA-Z0-9_]{3,24}$/.test(v)))].slice(0, 99) : [];
    if (name.length < 3 || name.length > 60 || description.length > 240 || usernames.length < 1) return res.status(400).json({ success: false, message: 'Ingresá un nombre válido y al menos una persona para crear el grupo.' });
    const users = await User.find({ username: { $in: usernames } }).select('_id username').lean();
    if (users.length !== usernames.length || users.some(user => String(user._id) === req.auth.sub)) return res.status(400).json({ success: false, message: 'Revisá los nombres de usuario: alguno no existe o corresponde a tu cuenta.' });
    const members = [{ user: req.auth.sub, username: req.auth.username, role: 'owner' }, ...users.map(user => ({ user: user._id, username: user.username, role: 'member' }))];
    const group = await GroupConversation.create({ name, description, owner: req.auth.sub, members });
    return res.status(201).json({ success: true, group: { id: String(group._id), name: group.name, description: group.description, memberCount: group.members.length, role: 'owner' } });
  } catch (error) { return next(error); }
});

router.get('/:groupId/messages', async (req, res, next) => {
  try {
    if (!validId(req.params.groupId)) return res.status(400).json({ success: false, message: 'Grupo inválido.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, 'members.user': req.auth.sub, status: 'active' }).lean();
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado o sin acceso.' });
    const before = req.query.before && validId(req.query.before) ? await GroupMessage.findById(req.query.before).select('createdAt').lean() : null;
    const filter = { conversation: group._id };
    if (before) filter.createdAt = { $lt: before.createdAt };
    const messages = await GroupMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.json({ success: true, messages: messages.reverse().map(serialize) });
  } catch (error) { return next(error); }
});

router.get('/:groupId/members', async (req, res, next) => {
  try {
    if (!validId(req.params.groupId)) return res.status(400).json({ success: false, message: 'Grupo inválido.' });
    const group = await GroupConversation.findOne({
      _id: req.params.groupId,
      'members.user': req.auth.sub,
      status: 'active'
    }).lean();
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado o sin acceso.' });
    return res.json({
      success: true,
      ownerId: String(group.owner),
      members: group.members.map(member => ({
        userId: String(member.user),
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt
      }))
    });
  } catch (error) { return next(error); }
});

router.post('/:groupId/messages', limiter, async (req, res, next) => {
  try {
    if (!validId(req.params.groupId)) return res.status(400).json({ success: false, message: 'Grupo inválido.' });
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 2000) return res.status(400).json({ success: false, message: 'El mensaje debe tener entre 1 y 2000 caracteres.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, 'members.user': req.auth.sub, status: 'active' });
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado o sin acceso.' });
    const saved = await GroupMessage.create({ conversation: group._id, sender: req.auth.sub, senderUsername: req.auth.username, body });
    group.lastMessage = body;
    group.lastMessageAt = saved.createdAt;
    await group.save();
    const message = serialize(saved);
    const io = req.app.get('io');
    if (io) io.to('group:' + String(group._id)).emit('group_message_received', message);
    return res.status(201).json({ success: true, message });
  } catch (error) { return next(error); }
});

router.post('/:groupId/members', limiter, async (req, res, next) => {
  try {
    if (!validId(req.params.groupId)) return res.status(400).json({ success: false, message: 'Grupo inválido.' });
    const username = typeof req.body.username === 'string' ? req.body.username.trim().replace(/^@/, '') : '';
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ success: false, message: 'Usuario inválido.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, status: 'active' });
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
    const actor = memberOf(group, req.auth.sub);
    if (!actor || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({ success: false, message: 'Solo propietarios y moderadores pueden invitar.' });
    if (group.members.length >= 100) return res.status(409).json({ success: false, message: 'El grupo alcanzó el límite de 100 integrantes.' });
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    if (group.members.some(member => String(member.user) === String(target._id))) return res.status(409).json({ success: false, message: 'Esa persona ya integra el grupo.' });
    group.members.push({ user: target._id, username: target.username, role: 'member' });
    await group.save();
    const io = req.app.get('io');
    try {
      const notification = await Notification.create({
        recipient: target._id,
        actor: req.auth.sub,
        type: 'group_invite',
        title: 'Te agregaron a un grupo',
        body: '@' + req.auth.username + ' te agregó a "' + group.name + '".',
        entityId: group._id
      });
      if (io) io.to('user:' + String(target._id)).emit('notification_received', {
        id: String(notification._id), type: notification.type, title: notification.title,
        body: notification.body, entityId: String(group._id), createdAt: notification.createdAt
      });
    } catch (notificationError) {
      console.error('Unable to persist group invitation notification:', notificationError.message);
    }
    if (io) io.to('group:' + String(group._id)).emit('group_member_added', {
      groupId: String(group._id), userId: String(target._id), username: target.username
    });
    return res.status(201).json({ success: true, memberCount: group.members.length, invitedUserId: String(target._id) });
  } catch (error) { return next(error); }
});

router.delete('/:groupId/members/:userId', limiter, async (req, res, next) => {
  try {
    if (!validId(req.params.groupId) || !validId(req.params.userId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, status: 'active' });
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
    const actor = memberOf(group, req.auth.sub);
    const target = memberOf(group, req.params.userId);
    if (!actor || !target) return res.status(404).json({ success: false, message: 'Integrante no encontrado.' });
    const selfLeave = String(req.auth.sub) === String(req.params.userId);
    if (!selfLeave && (actor.role !== 'owner' && actor.role !== 'moderator' || target.role === 'owner' || actor.role === 'moderator' && target.role === 'moderator')) return res.status(403).json({ success: false, message: 'No tenés permisos para quitar a esa persona.' });
    if (target.role === 'owner') return res.status(409).json({ success: false, message: 'El propietario debe transferir el grupo antes de salir.' });
    group.members = group.members.filter(member => String(member.user) !== String(req.params.userId));
    if (group.members.length < 2) group.status = 'archived';
    await group.save();
    const io = req.app.get('io');
    if (io) {
      const room = 'group:' + String(group._id);
      io.to(room).emit('group_member_removed', { groupId: String(group._id), userId: String(req.params.userId) });
      const sockets = await io.in(room).fetchSockets();
      await Promise.all(sockets.filter(socket => String(socket.data.userId) === String(req.params.userId)).map(socket => socket.leave(room)));
    }
    return res.json({ success: true, memberCount: group.members.length, archived: group.status === 'archived' });
  } catch (error) { return next(error); }
});

router.post('/:groupId/transfer', limiter, async (req, res, next) => {
  try {
    if (!validId(req.params.groupId)) return res.status(400).json({ success: false, message: 'Grupo inválido.' });
    const username = typeof req.body.username === 'string' ? req.body.username.trim().replace(/^@/, '') : '';
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ success: false, message: 'Ingresá un nombre de usuario válido.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, status: 'active' });
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
    if (String(group.owner) !== String(req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el propietario actual puede transferir el grupo.' });
    const target = group.members.find(member => member.username.toLowerCase() === username.toLowerCase());
    if (!target || String(target.user) === String(req.auth.sub)) return res.status(404).json({ success: false, message: 'La nueva persona propietaria debe ser integrante del grupo.' });
    const previousOwnerId = String(req.auth.sub);
    const newOwnerId = String(target.user);
    const previousOwner = memberOf(group, previousOwnerId);
    if (!previousOwner || previousOwner.role !== 'owner') return res.status(409).json({ success: false, message: 'El rol de propietario no coincide con el registro del grupo.' });
    previousOwner.role = 'moderator';
    target.role = 'owner';
    group.owner = target.user;
    await group.save();
    const io = req.app.get('io');
    if (io) io.to('group:' + String(group._id)).emit('group_owner_transferred', {
      groupId: String(group._id), previousOwnerId, newOwnerId
    });
    return res.json({ success: true, ownerId: newOwnerId, previousOwnerId, message: 'Propiedad transferida. Ahora sos moderador del grupo.' });
  } catch (error) { return next(error); }
});

router.patch('/:groupId/members/:userId/role', limiter, async (req, res, next) => {
  try {
    if (!validId(req.params.groupId) || !validId(req.params.userId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const role = req.body.role;
    if (!['moderator', 'member'].includes(role)) return res.status(400).json({ success: false, message: 'Rol inválido.' });
    const group = await GroupConversation.findOne({ _id: req.params.groupId, status: 'active' });
    if (!group) return res.status(404).json({ success: false, message: 'Grupo no encontrado.' });
    if (String(group.owner) !== String(req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el propietario puede administrar moderadores.' });
    const target = memberOf(group, req.params.userId);
    if (!target || target.role === 'owner') return res.status(404).json({ success: false, message: 'Integrante no encontrado.' });
    target.role = role;
    await group.save();
    return res.json({ success: true, userId: String(req.params.userId), role });
  } catch (error) { return next(error); }
});

module.exports = router;
