'use strict';

const Message = require('../models/Message');
const SwapRequest = require('../models/SwapRequest');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Load a swap and confirm the caller belongs to it. */
async function authorizeSwap(swapId, userId) {
  const swap = await SwapRequest.findById(swapId);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (!swap.involves(userId)) throw ApiError.forbidden('This conversation is not yours');
  return swap;
}

/** GET /api/messages/:swapId - thread history (feature 8). */
const getThread = asyncHandler(async (req, res) => {
  await authorizeSwap(req.params.swapId, req.user._id);

  const messages = await Message.find({ swap: req.params.swapId })
    .sort({ createdAt: 1 })
    .limit(Math.min(parseInt(req.query.limit || '200', 10), 500))
    .populate('sender', 'name avatarUrl')
    .lean();

  // Opening the thread clears this member's unread badge for it.
  await Message.updateMany(
    { swap: req.params.swapId, recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  res.json({ success: true, count: messages.length, messages });
});

/**
 * POST /api/messages/:swapId
 * REST fallback for sending - the socket path is primary, but this keeps the
 * chat usable if the websocket is blocked.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const swap = await authorizeSwap(req.params.swapId, req.user._id);
  const { body } = req.body;

  if (!body || !body.trim()) throw ApiError.badRequest('Message body is required');

  const message = await Message.create({
    swap: swap._id,
    sender: req.user._id,
    recipient: swap.counterpartOf(req.user._id),
    body: body.trim(),
  });

  await message.populate('sender', 'name avatarUrl');

  const { emitToRoom } = require('../sockets/emitter');
  emitToRoom(`swap:${swap._id}`, 'receive_message', message.toObject());

  res.status(201).json({ success: true, message });
});

/** GET /api/messages - conversation list with unread counts. */
const listConversations = asyncHandler(async (req, res) => {
  const swaps = await SwapRequest.find({
    $or: [{ requester: req.user._id }, { provider: req.user._id }],
    status: { $in: ['pending', 'accepted', 'completed'] },
  })
    .populate([
      { path: 'requester', select: 'name avatarUrl' },
      { path: 'provider', select: 'name avatarUrl' },
    ])
    .lean({ virtuals: true });

  const conversations = await Promise.all(
    swaps.map(async (swap) => {
      const [last, unread] = await Promise.all([
        Message.findOne({ swap: swap._id }).sort({ createdAt: -1 }).lean(),
        Message.countDocuments({ swap: swap._id, recipient: req.user._id, readAt: null }),
      ]);

      const isRequester = String(swap.requester._id) === String(req.user._id);

      return {
        swapId: swap._id,
        counterpart: isRequester ? swap.provider : swap.requester,
        skillRequested: swap.skillRequested,
        skillOffered: swap.skillOffered,
        status: swap.status,
        lastMessage: last || null,
        unread,
        updatedAt: last?.createdAt || swap.updatedAt,
      };
    })
  );

  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  res.json({
    success: true,
    count: conversations.length,
    totalUnread: conversations.reduce((n, c) => n + c.unread, 0),
    conversations,
  });
});

module.exports = { getThread, sendMessage, listConversations };
