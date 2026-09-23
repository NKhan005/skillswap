'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTrustScore, WEIGHTS } = require('../src/utils/trustScore');

test('a brand new member scores zero rather than a misleading default', () => {
  assert.equal(computeTrustScore({}).score, 0);
});

test('score never leaves the 0..100 range, even with absurd inputs', () => {
  const huge = computeTrustScore({
    averageRating: 5,
    totalReviews: 10000,
    completedSwaps: 10000,
    requestsReceived: 100,
    requestsResponded: 100,
  });
  assert.ok(huge.score <= 100, `expected <= 100, got ${huge.score}`);

  const negative = computeTrustScore({
    averageRating: 0,
    totalReviews: 0,
    completedSwaps: 0,
    requestsReceived: 50,
    requestsResponded: 0,
  });
  assert.ok(negative.score >= 0);
});

test('a single five-star review cannot make a new member look like a veteran', () => {
  const rookie = computeTrustScore({
    averageRating: 5,
    totalReviews: 1,
    completedSwaps: 1,
    requestsReceived: 1,
    requestsResponded: 1,
  });
  const veteran = computeTrustScore({
    averageRating: 4.8,
    totalReviews: 40,
    completedSwaps: 30,
    requestsReceived: 32,
    requestsResponded: 31,
  });
  assert.ok(rookie.score < veteran.score, `${rookie.score} should be below ${veteran.score}`);
});

test('the three weighted terms add up to the total score', () => {
  const stats = {
    averageRating: 4.5,
    totalReviews: 12,
    completedSwaps: 8,
    requestsReceived: 10,
    requestsResponded: 9,
  };
  const { score, breakdown } = computeTrustScore(stats);
  const summed = breakdown.reviews + breakdown.swaps + breakdown.response;
  // Each term is rounded independently, so allow one point of drift.
  assert.ok(Math.abs(summed - score) <= 1, `${summed} vs ${score}`);
});

test('ignoring requests drags the score down', () => {
  const base = {
    averageRating: 5,
    totalReviews: 20,
    completedSwaps: 20,
  };
  const responsive = computeTrustScore({ ...base, requestsReceived: 20, requestsResponded: 20 });
  const ghosting = computeTrustScore({ ...base, requestsReceived: 20, requestsResponded: 2 });

  assert.ok(responsive.score > ghosting.score);
  // The response term is worth 20 points, so the gap should approach that.
  assert.ok(responsive.score - ghosting.score > WEIGHTS.response * 100 * 0.8);
});

test('the notes example (20 swaps, 18 positive reviews) lands in the low 90s', () => {
  const { score } = computeTrustScore({
    averageRating: 4.8,
    totalReviews: 20,
    positiveReviews: 18,
    completedSwaps: 20,
    requestsReceived: 22,
    requestsResponded: 22,
  });
  assert.ok(score >= 88 && score <= 100, `expected a high score, got ${score}`);
});
