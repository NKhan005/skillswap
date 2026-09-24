'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const SwapRequest = require('../models/SwapRequest');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const { setIO } = require('./emitter');

/**
 * Feature 8 - realtime chat.
 *
 * Rooms:
 *   user:<userId>  - private notification channel, joined on connect
 *   swap:<swapId>  - one chat room per exchange request
 *
 * Membership in a swap room is checked against the database on every join,
 * so a client cannot listen in on a conversation by guessing an id.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
  });

  // Handshake auth: the client sends the same JWT it uses for REST.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace('Bearer ', '');

      if (!token) return next(new Error('Authentication token missing'));

      const payload = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('name avatarUrl');
      if (!user) return next(new Error('Account not found'));

      socket.user = { id: String(user._id), name: user.name, avatarUrl: user.avatarUrl };
      return next();
    } catch (err) {
      return next(new Error(`Socket authentication failed: ${err.message}`));
    }
  });

  /**
   * Wrap an event handler so every one reports failures the same way: a
   * chat_error to the sender plus a negative acknowledgement. Keeping this in
   * one place is what stops each handler carrying its own try/catch.
   */
  const handle = (socket, fn) => async (payload = {}, ack) => {
    try {
      const result = await fn(payload, socket);
      if (typeof ack === 'function') ack({ ok: true, ...(result || {}) });
    } catch (err) {
      socket.emit('chat_error', { message: err.message });
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  };

  /** Load a swap and confirm this socket's user belongs to it. */
  const authorizedSwap = async (swapId, userId) => {
    const swap = await SwapRequest.findById(swapId).select('requester provider');
    if (!swap) throw new Error('Swap not found');
    if (!swap.involves(userId)) throw new Error('You are not part of this swap');
    return swap;
  };

  io.on('connection', (socket) => {
    const { id: userId, name } = socket.user;
    socket.join(`user:${userId}`);
    logger.info(`Socket connected: ${name} (${socket.id})`);

    socket.emit('connected', { userId, socketId: socket.id });

    /** join_room - enter one swap's chat thread. */
    socket.on(
      'join_room',
      handle(socket, async ({ swapId }) => {
        await authorizedSwap(swapId, userId);

        const room = `swap:${swapId}`;
        socket.join(room);

        const history = await Message.find({ swap: swapId })
          .sort({ createdAt: 1 })
          .limit(100)
          .populate('sender', 'name avatarUrl')
          .lean();

        socket.emit('room_joined', { room, swapId, history });
        socket.to(room).emit('user_joined', { userId, name });

        return { room, count: history.length };
      })
    );

    /** leave_room */
    socket.on('leave_room', ({ swapId } = {}) => {
      const room = `swap:${swapId}`;
      socket.leave(room);
      socket.to(room).emit('user_left', { userId, name });
    });

    /** send_message - persist, then fan out to the room. */
    socket.on(
      'send_message',
      handle(socket, async ({ swapId, body }) => {
        if (!body || !body.trim()) throw new Error('Message body is required');

        const swap = await authorizedSwap(swapId, userId);
        const recipient = swap.counterpartOf(userId);

        const message = await Message.create({
          swap: swapId,
          sender: userId,
          recipient,
          body: body.trim().slice(0, 2000),
        });

        const payload = {
          ...message.toObject(),
          sender: { _id: userId, name, avatarUrl: socket.user.avatarUrl },
        };

        io.to(`swap:${swapId}`).emit('receive_message', payload);
        // Badge the recipient even when they are not in the room.
        io.to(`user:${recipient}`).emit('message:notification', {
          swapId,
          from: name,
          preview: payload.body.slice(0, 80),
        });

        return { message: payload };
      })
    );

    /** typing indicators */
    socket.on('typing', ({ swapId } = {}) => {
      socket.to(`swap:${swapId}`).emit('typing', { userId, name });
    });
    socket.on('stop_typing', ({ swapId } = {}) => {
      socket.to(`swap:${swapId}`).emit('stop_typing', { userId });
    });

    /** mark_read - clear unread state for a thread. */
    socket.on('mark_read', async ({ swapId } = {}) => {
      await Message.updateMany(
        { swap: swapId, recipient: userId, readAt: null },
        { $set: { readAt: new Date() } }
      );
      socket.to(`swap:${swapId}`).emit('messages_read', { swapId, by: userId });
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${name} (${reason})`);
    });
  });

  setIO(io);
  logger.info('Socket.io server ready');

  return io;
}

module.exports = { initSocketServer };
