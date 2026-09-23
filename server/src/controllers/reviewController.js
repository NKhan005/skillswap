'use strict';

const Review = require('../models/Review');
const SwapRequest = require('../models/SwapRequest');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recalculateTrustScore } = require('../utils/trustScore');
const { evaluateChallenges } = require('./challengeController');
const { emitToUser } = require('../sockets/emitter');

/** POST /api/reviews - feature 5, rate a finished swap. */
const createReview = asyncHandler(async (req, res) => {
  const { swapId, rating, comment, tags } = req.body;

  const swap = await SwapRequest.findById(swapId);
  if (!swap) throw ApiError.notFound('Swap not found');
  if (!swap.involves(req.user._id)) throw ApiError.forbidden('You were not part of this swap');
  if (swap.status !== 'completed') throw ApiError.badRequest('You can only review a completed swap');

  const reviewee = swap.counterpartOf(req.user._id);

  const already = await Review.findOne({ swap: swap._id, reviewer: req.user._id });
  if (already) throw ApiError.conflict('You already reviewed this swap');

  const isRequester = String(swap.requester) === String(req.user._id);

  const review = await Review.create({
    swap: swap._id,
    reviewer: req.user._id,
    reviewee,
    rating: Number(rating),
    comment: comment || '',
    // The reviewer received whichever skill the other side taught.
    skillTaught: isRequester ? swap.skillRequested : swap.skillOffered || '',
    tags: Array.isArray(tags) ? tags : [],
  });

  swap.reviews.push(review._id);
  await swap.save();

  // The model's post-save hook already recalculated; read the fresh numbers
  // back so the response carries the updated score.
  const updated = await User.findById(reviewee).select('trustScore trustStats name');
  await evaluateChallenges(reviewee);

  await review.populate([
    { path: 'reviewer', select: 'name avatarUrl' },
    { path: 'reviewee', select: 'name avatarUrl' },
  ]);

  emitToUser(reviewee, 'review:new', {
    review,
    trustScore: updated?.trustScore,
  });

  res.status(201).json({
    success: true,
    review,
    reviewee: { id: reviewee, trustScore: updated?.trustScore, trustStats: updated?.trustStats },
  });
});

/** GET /api/reviews/user/:userId */
const listUserReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ reviewee: req.params.userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(req.query.limit || '50', 10), 100))
    .populate('reviewer', 'name avatarUrl trustScore')
    .populate('swap', 'skillRequested skillOffered hours')
    .lean();

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => r.rating === stars).length,
  }));

  res.json({ success: true, count: reviews.length, reviews, distribution });
});

/** GET /api/reviews/pending - completed swaps this member has not reviewed. */
const listPendingReviews = asyncHandler(async (req, res) => {
  const swaps = await SwapRequest.find({
    status: 'completed',
    $or: [{ requester: req.user._id }, { provider: req.user._id }],
  })
    .populate([
      { path: 'requester', select: 'name avatarUrl' },
      { path: 'provider', select: 'name avatarUrl' },
    ])
    .lean({ virtuals: true });

  const reviewed = await Review.find({ reviewer: req.user._id }).select('swap').lean();
  const reviewedIds = new Set(reviewed.map((r) => String(r.swap)));

  const pending = swaps.filter((s) => !reviewedIds.has(String(s._id)));

  res.json({ success: true, count: pending.length, swaps: pending });
});

/** GET /api/reviews/trust/:userId - score plus its breakdown. */
const getTrustBreakdown = asyncHandler(async (req, res) => {
  const result = await recalculateTrustScore(req.params.userId);
  if (!result) throw ApiError.notFound('User not found');

  const { computeTrustScore } = require('../utils/trustScore');
  const { breakdown } = computeTrustScore(result.trustStats);

  res.json({ success: true, ...result, breakdown });
});

module.exports = { createReview, listUserReviews, listPendingReviews, getTrustBreakdown };
