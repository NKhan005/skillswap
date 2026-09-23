'use strict';

const mongoose = require('mongoose');
const Challenge = require('../models/Challenge');
const SwapRequest = require('../models/SwapRequest');
const Review = require('../models/Review');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { postTransaction } = require('../utils/wallet');
const { emitToUser } = require('../sockets/emitter');
const logger = require('../utils/logger');

/** Current value of a challenge metric for one member. */
async function measure(metric, userId) {
  const id = new mongoose.Types.ObjectId(String(userId));

  switch (metric) {
    case 'completed_swaps':
      return SwapRequest.countDocuments({
        status: 'completed',
        $or: [{ requester: id }, { provider: id }],
      });

    case 'people_taught': {
      // Distinct counterparties this member taught in a completed swap.
      const rows = await SwapRequest.aggregate([
        { $match: { status: 'completed', $or: [{ requester: id }, { provider: id }] } },
        {
          $project: {
            other: { $cond: [{ $eq: ['$provider', id] }, '$requester', '$provider'] },
            taught: { $or: [{ $eq: ['$provider', id] }, { $eq: ['$type', 'direct'] }] },
          },
        },
        { $match: { taught: true } },
        { $group: { _id: '$other' } },
        { $count: 'total' },
      ]);
      return rows[0]?.total || 0;
    }

    case 'reviews_received':
      return Review.countDocuments({ reviewee: id });

    case 'hours_taught': {
      const rows = await SwapRequest.aggregate([
        { $match: { status: 'completed', provider: id } },
        { $group: { _id: null, hours: { $sum: '$hours' } } },
      ]);
      return rows[0]?.hours || 0;
    }

    default:
      return 0;
  }
}

/**
 * Feature 10 - re-measure every active challenge the member joined and pay out
 * any that just crossed the target. Called after swaps and reviews complete.
 * Never throws into the caller's flow: a challenge payout must not roll back a
 * completed swap.
 */
async function evaluateChallenges(userId) {
  const completed = [];

  try {
    const challenges = await Challenge.find({
      isActive: true,
      'participants.user': userId,
    });

    for (const challenge of challenges) {
      const participant = challenge.participantFor(userId);
      if (!participant || participant.rewarded) continue;

      const progress = await measure(challenge.metric, userId);
      participant.progress = progress;

      if (progress >= challenge.target && !participant.completedAt) {
        participant.completedAt = new Date();
        participant.rewarded = true;

        await postTransaction({
          userId,
          type: 'challenge_reward',
          amount: challenge.rewardCredits,
          challengeId: challenge._id,
          description: `Challenge complete: ${challenge.title}`,
        });

        await User.updateOne({ _id: userId }, { $addToSet: { challengesCompleted: challenge._id } });

        completed.push({
          challengeId: challenge._id,
          title: challenge.title,
          rewardCredits: challenge.rewardCredits,
        });

        emitToUser(userId, 'challenge:completed', {
          title: challenge.title,
          rewardCredits: challenge.rewardCredits,
        });
      }

      challenge.markModified('participants');
      await challenge.save();
    }
  } catch (err) {
    logger.error(`Challenge evaluation failed for ${userId}: ${err.message}`);
  }

  return completed;
}

/** GET /api/challenges - active challenges with this member's progress. */
const listChallenges = asyncHandler(async (req, res) => {
  const challenges = await Challenge.find({ isActive: true }).sort({ createdAt: -1 }).lean();

  const withProgress = await Promise.all(
    challenges.map(async (c) => {
      const participant = c.participants.find((p) => String(p.user) === String(req.user._id));
      const progress = participant ? await measure(c.metric, req.user._id) : 0;
      return {
        ...c,
        participants: undefined,
        participantCount: c.participants.length,
        joined: Boolean(participant),
        progress,
        completed: Boolean(participant?.completedAt),
        percent: Math.min(100, Math.round((progress / c.target) * 100)),
      };
    })
  );

  res.json({ success: true, count: withProgress.length, challenges: withProgress });
});

/** POST /api/challenges/:id/join */
const joinChallenge = asyncHandler(async (req, res) => {
  const challenge = await Challenge.findById(req.params.id);
  if (!challenge) throw ApiError.notFound('Challenge not found');
  if (!challenge.isActive) throw ApiError.badRequest('This challenge has closed');

  if (challenge.participantFor(req.user._id)) {
    throw ApiError.conflict('You already joined this challenge');
  }

  const progress = await measure(challenge.metric, req.user._id);
  challenge.participants.push({ user: req.user._id, progress });
  await challenge.save();

  // Joining with the target already met should pay out immediately.
  const completed = await evaluateChallenges(req.user._id);

  res.status(201).json({ success: true, challenge, progress, completed });
});

/** POST /api/challenges - create a community challenge. */
const createChallenge = asyncHandler(async (req, res) => {
  const { title, description, metric, target, rewardCredits, endsAt } = req.body;

  const challenge = await Challenge.create({
    title,
    description: description || '',
    metric,
    target: Number(target),
    rewardCredits: Number(rewardCredits ?? 10),
    endsAt: endsAt || undefined,
  });

  res.status(201).json({ success: true, challenge });
});

/** GET /api/challenges/leaderboard - trust + completed swaps ranking. */
const getLeaderboard = asyncHandler(async (_req, res) => {
  const leaders = await User.find({ isAvailable: true })
    .select('name avatarUrl city trustScore trustStats.completedSwaps wallet.totalEarned')
    .sort({ trustScore: -1, 'trustStats.completedSwaps': -1 })
    .limit(20)
    .lean();

  res.json({ success: true, leaders });
});

module.exports = {
  listChallenges,
  joinChallenge,
  createChallenge,
  getLeaderboard,
  evaluateChallenges,
  measure,
};
