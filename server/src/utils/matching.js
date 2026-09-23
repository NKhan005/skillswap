'use strict';

const mongoose = require('mongoose');

/**
 * Features 2 and 3 - matching engine.
 *
 * A *direct* match is mutual: the candidate offers something I need AND needs
 * something I offer. That double condition is what makes a swap possible with
 * no money changing hands.
 *
 * Skill names are compared case-insensitively on a normalised form, so
 * "React JS", "react js" and "  React   JS " all match.
 */

const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const RADIUS_PRESETS_KM = [1, 5, 10, 20];

/** Names a user offers / needs, normalised and de-duplicated. */
function skillSets(user) {
  return {
    offers: new Set((user.skillsOffered || []).map((s) => normalize(s.name))),
    needs: new Set((user.skillsNeeded || []).map((s) => normalize(s.name))),
  };
}

/** Intersection of two sets, as an array preserving the first set's order. */
function intersect(a, b) {
  return [...a].filter((x) => b.has(x));
}

/**
 * Score a candidate against the viewer.
 *  - a mutual (two-way) match always outranks a one-way one
 *  - more overlapping skills ranks higher
 *  - trust score and proximity break ties
 */
function scoreMatch({ theyTeachMe, iTeachThem, candidate, distanceKm }) {
  const mutual = theyTeachMe.length > 0 && iTeachThem.length > 0;

  let score = 0;
  if (mutual) score += 50;
  score += Math.min(20, theyTeachMe.length * 7);
  score += Math.min(15, iTeachThem.length * 5);
  score += (candidate.trustScore || 0) * 0.1; // up to 10
  if (typeof distanceKm === 'number') {
    // Full 5 points inside 1km, decaying to 0 at 25km.
    score += Math.max(0, 5 * (1 - Math.min(distanceKm, 25) / 25));
  }

  return Math.round(score * 10) / 10;
}

/**
 * Build the match view of a candidate relative to the viewer.
 * Returns null when there is no overlap at all in either direction.
 */
function buildMatch(viewerSets, candidate, distanceKm) {
  const cand = skillSets(candidate);

  const theyTeachMe = intersect(viewerSets.needs, cand.offers);
  const iTeachThem = intersect(viewerSets.offers, cand.needs);

  if (theyTeachMe.length === 0 && iTeachThem.length === 0) return null;

  const plain = typeof candidate.toObject === 'function' ? candidate.toObject() : candidate;
  delete plain.password;
  delete plain.email;

  return {
    user: plain,
    matchType: theyTeachMe.length && iTeachThem.length ? 'mutual' : 'one-way',
    theyTeachMe,
    iTeachThem,
    distanceKm: typeof distanceKm === 'number' ? Math.round(distanceKm * 100) / 100 : null,
    matchScore: scoreMatch({ theyTeachMe, iTeachThem, candidate: plain, distanceKm }),
  };
}

/**
 * Feature 2 - smart direct matching.
 * Narrows candidates in the database with an $or on the two skill lists, then
 * scores the mutual overlap in memory.
 *
 * @param {object} viewer            the requesting user document
 * @param {object} [opts]
 * @param {boolean} [opts.mutualOnly=false] drop one-way matches
 * @param {string}  [opts.category]  restrict to one skill category
 * @param {number}  [opts.limit=30]
 */
async function findDirectMatches(viewer, opts = {}) {
  const { mutualOnly = false, category, limit = 30 } = opts;
  const User = mongoose.model('User');

  const sets = skillSets(viewer);
  const needArray = [...sets.needs];
  const offerArray = [...sets.offers];

  if (needArray.length === 0 && offerArray.length === 0) return [];

  // Case-insensitive name match without a $regex scan per skill.
  const nameIn = (values) => values.map((v) => new RegExp(`^\\s*${escapeRegex(v)}\\s*$`, 'i'));

  const query = {
    _id: { $ne: viewer._id },
    isAvailable: true,
    $or: [
      { 'skillsOffered.name': { $in: nameIn(needArray) } },
      { 'skillsNeeded.name': { $in: nameIn(offerArray) } },
    ],
  };

  if (category) {
    query['skillsOffered.category'] = category;
  }

  const candidates = await User.find(query).limit(200).lean();

  const matches = candidates
    .map((c) => buildMatch(sets, c))
    .filter(Boolean)
    .filter((m) => (mutualOnly ? m.matchType === 'mutual' : true))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return matches;
}

/**
 * Feature 3 - nearby matching.
 * `$geoNear` is used through the aggregation pipeline because it is the only
 * stage that returns the computed distance, which the UI shows per card.
 *
 * @param {object} viewer
 * @param {object} opts
 * @param {number} opts.radiusKm     1 | 5 | 10 | 20 (any positive number works)
 * @param {[number,number]} [opts.coordinates] override the viewer's stored point
 * @param {boolean} [opts.mutualOnly=false]
 * @param {boolean} [opts.skillFilter=true] require some skill overlap
 */
async function findNearbyMatches(viewer, opts = {}) {
  const {
    radiusKm = 10,
    coordinates,
    mutualOnly = false,
    skillFilter = true,
    category,
    limit = 50,
  } = opts;

  const User = mongoose.model('User');
  const origin = coordinates || viewer.location?.coordinates;

  if (!origin || origin.length !== 2) {
    const err = new Error('Set your location before searching nearby');
    err.statusCode = 400;
    throw err;
  }

  const match = { _id: { $ne: new mongoose.Types.ObjectId(String(viewer._id)) }, isAvailable: true };
  if (category) match['skillsOffered.category'] = category;

  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(origin[0]), Number(origin[1])] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: match,
      },
    },
    { $limit: 300 },
    { $project: { password: 0, email: 0, __v: 0 } },
  ];

  const candidates = await User.aggregate(pipeline);
  const sets = skillSets(viewer);

  const results = candidates
    .map((c) => {
      const distanceKm = c.distanceMeters / 1000;
      if (!skillFilter) {
        const m = buildMatch(sets, c, distanceKm);
        if (m) return m;
        return {
          user: c,
          matchType: 'nearby',
          theyTeachMe: [],
          iTeachThem: [],
          distanceKm: Math.round(distanceKm * 100) / 100,
          matchScore: scoreMatch({ theyTeachMe: [], iTeachThem: [], candidate: c, distanceKm }),
        };
      }
      return buildMatch(sets, c, distanceKm);
    })
    .filter(Boolean)
    .filter((m) => (mutualOnly ? m.matchType === 'mutual' : true))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return results;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  findDirectMatches,
  findNearbyMatches,
  buildMatch,
  skillSets,
  scoreMatch,
  normalize,
  RADIUS_PRESETS_KM,
};
