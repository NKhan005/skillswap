'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Feature 4 - Trust Score engine.
 *
 *   Trust Score = Reviews + Completed Swaps + Response Rate
 *
 * Each term is normalised to 0..1 and weighted, so the result always lands in
 * 0..100 no matter how active a member is.
 *
 *   reviews   (50%) : average rating scaled 1..5 -> 0..1, damped by a
 *                     Bayesian prior so one 5-star review is not a 100.
 *   swaps     (30%) : completed swaps against a saturation target.
 *   response  (20%) : answered requests / received requests.
 *
 * A member with no history scores 0 rather than a misleading default.
 */
const WEIGHTS = { reviews: 0.5, swaps: 0.3, response: 0.2 };

// Swaps needed to max out the activity term.
const SWAP_SATURATION = 20;
// Bayesian prior: pretend everyone starts with PRIOR_COUNT reviews at
// PRIOR_RATING, so early ratings move the score gradually.
const PRIOR_COUNT = 3;
const PRIOR_RATING = 3.5;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Normalise a 1..5 average into 0..1, damped by the prior. */
function reviewTerm(averageRating, totalReviews) {
  if (!totalReviews) return 0;
  const damped =
    (averageRating * totalReviews + PRIOR_RATING * PRIOR_COUNT) / (totalReviews + PRIOR_COUNT);
  return clamp01((damped - 1) / 4);
}

/** Diminishing-returns curve on completed swaps. */
function swapTerm(completedSwaps) {
  if (!completedSwaps) return 0;
  return clamp01(Math.log10(1 + (9 * completedSwaps) / SWAP_SATURATION));
}

/** Share of incoming requests the member actually answered. */
function responseTerm(requestsResponded, requestsReceived) {
  if (!requestsReceived) return 0;
  return clamp01(requestsResponded / requestsReceived);
}

/**
 * Pure scoring function - exported so it can be unit tested without a database.
 * @param {{averageRating:number,totalReviews:number,completedSwaps:number,requestsResponded:number,requestsReceived:number}} stats
 * @returns {{score:number, breakdown:object}}
 */
function computeTrustScore(stats = {}) {
  const {
    averageRating = 0,
    totalReviews = 0,
    completedSwaps = 0,
    requestsResponded = 0,
    requestsReceived = 0,
  } = stats;

  const reviews = reviewTerm(averageRating, totalReviews);
  const swaps = swapTerm(completedSwaps);
  const response = responseTerm(requestsResponded, requestsReceived);

  const score = Math.round(
    (reviews * WEIGHTS.reviews + swaps * WEIGHTS.swaps + response * WEIGHTS.response) * 100
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      reviews: Math.round(reviews * WEIGHTS.reviews * 100),
      swaps: Math.round(swaps * WEIGHTS.swaps * 100),
      response: Math.round(response * WEIGHTS.response * 100),
      weights: WEIGHTS,
    },
  };
}

/**
 * Re-derive every trust input for a user straight from the source collections,
 * then persist the score. Recomputing from scratch keeps the score correct
 * even if an individual counter drifted.
 */
async function recalculateTrustScore(userId) {
  const User = mongoose.model('User');
  const Review = mongoose.model('Review');
  const SwapRequest = mongoose.model('SwapRequest');

  const user = await User.findById(userId);
  if (!user) return null;

  const [ratingAgg] = await Review.aggregate([
    { $match: { reviewee: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        positiveReviews: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
      },
    },
  ]);

  const completedSwaps = await SwapRequest.countDocuments({
    status: 'completed',
    $or: [{ requester: userId }, { provider: userId }],
  });

  // Response rate looks only at requests where this user was the provider:
  // anything they moved out of 'pending' counts as a response.
  const requestsReceived = await SwapRequest.countDocuments({ provider: userId });
  const requestsResponded = await SwapRequest.countDocuments({
    provider: userId,
    status: { $ne: 'pending' },
  });

  const stats = {
    totalReviews: ratingAgg?.totalReviews || 0,
    averageRating: Math.round((ratingAgg?.averageRating || 0) * 100) / 100,
    positiveReviews: ratingAgg?.positiveReviews || 0,
    completedSwaps,
    requestsReceived,
    requestsResponded,
    responseRate: requestsReceived ? requestsResponded / requestsReceived : 0,
  };

  const { score } = computeTrustScore(stats);

  user.trustStats = stats;
  user.trustScore = score;
  await user.save({ validateModifiedOnly: true });

  logger.debug(`Trust score for ${user.email || userId} recalculated to ${score}`);

  return { trustScore: score, trustStats: stats };
}

module.exports = {
  computeTrustScore,
  recalculateTrustScore,
  WEIGHTS,
  SWAP_SATURATION,
};
