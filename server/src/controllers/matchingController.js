'use strict';

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { findDirectMatches, findNearbyMatches, RADIUS_PRESETS_KM } = require('../utils/matching');

/** GET /api/matching - feature 2, smart direct matching. */
const getDirectMatches = asyncHandler(async (req, res) => {
  const { mutualOnly, category, limit } = req.query;

  const matches = await findDirectMatches(req.user, {
    mutualOnly: mutualOnly === 'true',
    category: category || undefined,
    limit: Math.min(parseInt(limit || '30', 10), 100),
  });

  res.json({
    success: true,
    count: matches.length,
    mutualCount: matches.filter((m) => m.matchType === 'mutual').length,
    matches,
  });
});

/** GET /api/matching/nearby - feature 3, radius search. */
const getNearbyMatches = asyncHandler(async (req, res) => {
  const { radius, lng, lat, mutualOnly, skillFilter, category, limit } = req.query;

  // The clamp only guards against NaN, zero and negative input. It is not a
  // product limit: $geoNear is index-backed and the pipeline caps the number
  // of candidates, so a wide radius costs no more than a narrow one.
  const parsed = parseFloat(radius);
  const radiusKm = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 10, 0.1), 20_000);
  const coordinates =
    lng !== undefined && lat !== undefined ? [parseFloat(lng), parseFloat(lat)] : undefined;

  const matches = await findNearbyMatches(req.user, {
    radiusKm,
    coordinates,
    mutualOnly: mutualOnly === 'true',
    // Default true: the feed is about swaps, not a people directory.
    skillFilter: skillFilter !== 'false',
    category: category || undefined,
    limit: Math.min(parseInt(limit || '50', 10), 100),
  });

  res.json({
    success: true,
    radiusKm,
    presets: RADIUS_PRESETS_KM,
    count: matches.length,
    matches,
  });
});

/** GET /api/matching/explore - browse/search members without needing a match. */
const explore = asyncHandler(async (req, res) => {
  const { q, category, minTrust, limit } = req.query;

  const query = { _id: { $ne: req.user._id }, isAvailable: true };

  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { 'skillsOffered.name': rx }, { 'skillsNeeded.name': rx }, { city: rx }];
  }
  if (category) query['skillsOffered.category'] = category;
  if (minTrust) query.trustScore = { $gte: parseInt(minTrust, 10) };

  const users = await User.find(query)
    .select('-email')
    .sort({ trustScore: -1, lastActiveAt: -1 })
    .limit(Math.min(parseInt(limit || '40', 10), 100))
    .lean();

  res.json({ success: true, count: users.length, users });
});

/** GET /api/matching/skills - distinct skill names, for filter dropdowns. */
const getSkillCatalog = asyncHandler(async (_req, res) => {
  const offered = await User.aggregate([
    { $unwind: '$skillsOffered' },
    {
      $group: {
        _id: { $toLower: '$skillsOffered.name' },
        category: { $first: '$skillsOffered.category' },
        teachers: { $sum: 1 },
      },
    },
    { $sort: { teachers: -1 } },
    { $limit: 100 },
    { $project: { _id: 0, name: '$_id', category: 1, teachers: 1 } },
  ]);

  res.json({ success: true, skills: offered, categories: User.SKILL_CATEGORIES });
});

module.exports = { getDirectMatches, getNearbyMatches, explore, getSkillCatalog };
