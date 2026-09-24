'use strict';

const SwapRequest = require('../models/SwapRequest');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { transferCredits } = require('../utils/wallet');
const { recalculateTrustScore } = require('../utils/trustScore');
const { evaluateChallenges } = require('./challengeController');
const { emitToUser, emitToRoom } = require('../sockets/emitter');
const env = require('../config/env');
const { normalize } = require('../utils/matching');

const POPULATE = [
  { path: 'requester', select: 'name avatarUrl city trustScore skillsOffered skillsNeeded' },
  { path: 'provider', select: 'name avatarUrl city trustScore skillsOffered skillsNeeded' },
];

/** Drop a system line into the swap thread so the chat reads as a timeline. */
async function systemMessage(swap, body) {
  const msg = await Message.create({
    swap: swap._id,
    sender: swap.requester._id || swap.requester,
    recipient: swap.provider._id || swap.provider,
    body,
    kind: 'system',
  });
  emitToRoom(`swap:${swap._id}`, 'receive_message', msg.toObject());
  return msg;
}

/** Does this member list `skillName` among the skills they teach? */
function teaches(member, skillName) {
  return (member.skillsOffered || []).some((s) => normalize(s.name) === normalize(skillName));
}

/** The provider must exist, not be the requester, and teach what is asked. */
async function resolveProvider(requester, providerId, skillRequested) {
  if (String(providerId) === String(requester._id)) {
    throw ApiError.badRequest('You cannot swap with yourself');
  }

  const provider = await User.findById(providerId);
  if (!provider) throw ApiError.notFound('That member no longer exists');

  if (!teaches(provider, skillRequested)) {
    throw ApiError.badRequest(`${provider.name} does not list "${skillRequested}" as a skill they teach`);
  }

  return provider;
}

/**
 * Settle how the swap pays: a direct swap needs a skill taught back, a credit
 * swap needs the balance to cover it. Returns the priced terms.
 */
function priceSwap(requester, { type, hours, skillOffered }) {
  const swapType = type === 'credit' ? 'credit' : 'direct';

  if (swapType === 'direct') {
    if (!teaches(requester, skillOffered)) {
      throw ApiError.badRequest(`Add "${skillOffered}" to your offered skills before offering it in a swap`);
    }
    return { swapType, creditCost: 0 };
  }

  const creditCost = Number(hours) * env.CREDITS_PER_HOUR;
  if (requester.wallet.balance < creditCost) {
    throw ApiError.badRequest(
      `This swap costs ${creditCost} credits and your balance is ${requester.wallet.balance}`
    );
  }

  return { swapType, creditCost };
}

/** One live request per pair per skill keeps threads meaningful. */
async function rejectDuplicate(requesterId, providerId, skillRequested) {
  const duplicate = await SwapRequest.findOne({
    requester: requesterId,
    provider: providerId,
    skillRequested,
    status: { $in: ['pending', 'accepted'] },
  });
  if (duplicate) throw ApiError.conflict('You already have an open request for this skill');
}

/** POST /api/swaps - feature 2 + 6: open a direct or credit-settled request. */
const createSwap = asyncHandler(async (req, res) => {
  const { providerId, skillRequested, skillOffered, hours = 1, message, type, scheduledAt, meetingLocation } =
    req.body;

  await resolveProvider(req.user, providerId, skillRequested);
  const { swapType, creditCost } = priceSwap(req.user, { type, hours, skillOffered });
  await rejectDuplicate(req.user._id, providerId, skillRequested);

  const swap = await SwapRequest.create({
    requester: req.user._id,
    provider: providerId,
    type: swapType,
    skillRequested,
    skillOffered: swapType === 'direct' ? skillOffered : undefined,
    hours: Number(hours),
    creditCost,
    message: message || '',
    meetingLocation: meetingLocation || '',
    scheduledAt: scheduledAt || undefined,
  });

  await swap.populate(POPULATE);

  emitToUser(providerId, 'swap:new', { swap });

  res.status(201).json({ success: true, swap });
});

/** GET /api/swaps - every swap this member is part of. */
const listSwaps = asyncHandler(async (req, res) => {
  const { status, role } = req.query;

  const query = {};
  if (role === 'requester') query.requester = req.user._id;
  else if (role === 'provider') query.provider = req.user._id;
  else query.$or = [{ requester: req.user._id }, { provider: req.user._id }];

  if (status) query.status = status;

  const swaps = await SwapRequest.find(query).populate(POPULATE).sort({ updatedAt: -1 }).lean({ virtuals: true });

  res.json({
    success: true,
    count: swaps.length,
    swaps,
    summary: {
      pending: swaps.filter((s) => s.status === 'pending').length,
      accepted: swaps.filter((s) => s.status === 'accepted').length,
      completed: swaps.filter((s) => s.status === 'completed').length,
    },
  });
});

/** GET /api/swaps/:id */
const getSwap = asyncHandler(async (req, res) => {
  const swap = await SwapRequest.findById(req.params.id).populate(POPULATE);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (!swap.involves(req.user._id)) throw ApiError.forbidden('This swap is not yours');

  res.json({ success: true, swap });
});

/** PATCH /api/swaps/:id/accept - provider only. */
const acceptSwap = asyncHandler(async (req, res) => {
  const swap = await SwapRequest.findById(req.params.id).populate(POPULATE);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (String(swap.provider._id) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the provider can accept this request');
  }
  if (swap.status !== 'pending') throw ApiError.badRequest(`This swap is already ${swap.status}`);

  swap.status = 'accepted';
  swap.respondedAt = new Date();
  if (req.body.scheduledAt) swap.scheduledAt = req.body.scheduledAt;
  if (req.body.meetingLocation) swap.meetingLocation = req.body.meetingLocation;
  await swap.save();

  await systemMessage(swap, `${req.user.name} accepted the swap. Chat here to arrange the details.`);
  // Responding changes the provider's response rate, which feeds trust.
  await recalculateTrustScore(req.user._id);

  emitToUser(swap.requester._id, 'swap:accepted', { swap });

  res.json({ success: true, swap });
});

/** PATCH /api/swaps/:id/decline - provider only. */
const declineSwap = asyncHandler(async (req, res) => {
  const swap = await SwapRequest.findById(req.params.id).populate(POPULATE);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (String(swap.provider._id) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the provider can decline this request');
  }
  if (swap.status !== 'pending') throw ApiError.badRequest(`This swap is already ${swap.status}`);

  swap.status = 'declined';
  swap.respondedAt = new Date();
  swap.cancelledBy = req.user._id;
  swap.cancelReason = req.body.reason || '';
  await swap.save();

  await recalculateTrustScore(req.user._id);
  emitToUser(swap.requester._id, 'swap:declined', { swap });

  res.json({ success: true, swap });
});

/**
 * PATCH /api/swaps/:id/complete
 * Both sides confirm; the credit transfer fires once on the second
 * confirmation, so neither party can settle the wallet alone.
 */
const completeSwap = asyncHandler(async (req, res) => {
  const swap = await SwapRequest.findById(req.params.id).populate(POPULATE);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (!swap.involves(req.user._id)) throw ApiError.forbidden('This swap is not yours');
  if (swap.status === 'completed') throw ApiError.badRequest('This swap is already completed');
  if (swap.status !== 'accepted') throw ApiError.badRequest('Only an accepted swap can be completed');

  const isRequester = String(swap.requester._id) === String(req.user._id);
  if (isRequester) swap.requesterConfirmed = true;
  else swap.providerConfirmed = true;

  if (!(swap.requesterConfirmed && swap.providerConfirmed)) {
    await swap.save();
    emitToUser(swap.counterpartOf(req.user._id)._id, 'swap:confirm_pending', { swap });
    return res.json({
      success: true,
      swap,
      awaitingConfirmationFrom: isRequester ? 'provider' : 'requester',
    });
  }

  // Second confirmation: settle.
  let transfer = null;
  if (swap.type === 'credit' && swap.creditCost > 0) {
    transfer = await transferCredits({
      fromUserId: swap.requester._id,
      toUserId: swap.provider._id,
      amount: swap.creditCost,
      swapId: swap._id,
      skill: swap.skillRequested,
    });
  }

  swap.status = 'completed';
  swap.completedAt = new Date();
  await swap.save();

  await systemMessage(swap, 'Swap completed. Leave a review to help the community.');

  // Completion moves both trust scores and can finish a challenge.
  await Promise.all([
    recalculateTrustScore(swap.requester._id),
    recalculateTrustScore(swap.provider._id),
  ]);
  const challengeResults = await Promise.all([
    evaluateChallenges(swap.requester._id),
    evaluateChallenges(swap.provider._id),
  ]);

  emitToUser(swap.requester._id, 'swap:completed', { swap });
  emitToUser(swap.provider._id, 'swap:completed', { swap });

  res.json({
    success: true,
    swap,
    creditsTransferred: transfer ? swap.creditCost : 0,
    challengesCompleted: challengeResults.flat(),
  });
});

/** PATCH /api/swaps/:id/cancel - either side, before completion. */
const cancelSwap = asyncHandler(async (req, res) => {
  const swap = await SwapRequest.findById(req.params.id).populate(POPULATE);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (!swap.involves(req.user._id)) throw ApiError.forbidden('This swap is not yours');
  if (swap.isSettled) throw ApiError.badRequest(`This swap is already ${swap.status}`);

  swap.status = 'cancelled';
  swap.cancelledBy = req.user._id;
  swap.cancelReason = req.body.reason || '';
  await swap.save();

  await systemMessage(swap, `${req.user.name} cancelled this swap.`);
  emitToUser(swap.counterpartOf(req.user._id)._id, 'swap:cancelled', { swap });

  res.json({ success: true, swap });
});

module.exports = {
  createSwap,
  listSwaps,
  getSwap,
  acceptSwap,
  declineSwap,
  completeSwap,
  cancelSwap,
};
