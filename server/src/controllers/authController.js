'use strict';

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../middleware/auth');
const env = require('../config/env');

/** Shape the authenticated-user payload the client stores. */
function sessionPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    city: user.city,
    bio: user.bio,
    experienceLevel: user.experienceLevel,
    skillsOffered: user.skillsOffered,
    skillsNeeded: user.skillsNeeded,
    location: user.location,
    wallet: user.wallet,
    trustScore: user.trustScore,
    trustStats: user.trustStats,
    verification: user.verification,
    isAvailable: user.isAvailable,
    createdAt: user.createdAt,
  };
}

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, city, bio, skillsOffered, skillsNeeded, experienceLevel, coordinates } =
    req.body;

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw ApiError.conflict('That email is already registered');

  const user = new User({
    name,
    email,
    password,
    city: city || '',
    bio: bio || '',
    experienceLevel: experienceLevel || 'beginner',
    skillsOffered: Array.isArray(skillsOffered) ? skillsOffered : [],
    skillsNeeded: Array.isArray(skillsNeeded) ? skillsNeeded : [],
  });

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    user.location = { type: 'Point', coordinates: [Number(coordinates[0]), Number(coordinates[1])] };
  }

  await user.save();

  // Seed the wallet ledger so the signup bonus is auditable like any other row.
  await Transaction.create({
    user: user._id,
    type: 'signup_bonus',
    amount: env.SIGNUP_BONUS_CREDITS,
    balanceAfter: user.wallet.balance,
    description: 'Welcome bonus credits',
  });

  res.status(201).json({
    success: true,
    token: signToken(user._id),
    user: sessionPayload(user),
  });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  // Same message either way so the endpoint does not confirm which emails exist.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastActiveAt = new Date();
  await user.save({ validateModifiedOnly: true });

  res.json({
    success: true,
    token: signToken(user._id),
    user: sessionPayload(user),
  });
});

/** GET /api/auth/me */
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: sessionPayload(req.user) });
});

/** Fields copied straight across when the request supplies them. */
const SCALAR_FIELDS = ['name', 'bio', 'city', 'avatarUrl', 'experienceLevel'];
/** Fields only accepted as arrays, so a stray value cannot clear a list. */
const ARRAY_FIELDS = ['skillsOffered', 'skillsNeeded'];
const VERIFICATION_LINKS = ['githubUrl', 'leetcodeUrl', 'portfolioUrl', 'linkedinUrl'];

/**
 * Feature 9 - merge verification links rather than replacing the subdocument,
 * so a partial update cannot wipe certifications the client did not send.
 */
function mergeVerification(current, incoming) {
  const merged = current || {};

  for (const key of VERIFICATION_LINKS) {
    if (incoming[key] !== undefined) merged[key] = incoming[key];
  }
  if (Array.isArray(incoming.certifications)) merged.certifications = incoming.certifications;
  if (Array.isArray(incoming.projects)) merged.projects = incoming.projects;

  merged.isVerified = Boolean(
    merged.githubUrl || merged.portfolioUrl || merged.linkedinUrl || (merged.certifications || []).length
  );

  return merged;
}

/** PUT /api/auth/me - profile, skills, location and verification links. */
const updateMe = asyncHandler(async (req, res) => {
  const user = req.user;
  const body = req.body;

  for (const field of SCALAR_FIELDS) {
    if (body[field] !== undefined) user[field] = body[field];
  }
  for (const field of ARRAY_FIELDS) {
    if (Array.isArray(body[field])) user[field] = body[field];
  }
  if (body.isAvailable !== undefined) user.isAvailable = Boolean(body.isAvailable);

  if (Array.isArray(body.coordinates) && body.coordinates.length === 2) {
    user.location = {
      type: 'Point',
      coordinates: [Number(body.coordinates[0]), Number(body.coordinates[1])],
    };
  }

  if (body.verification && typeof body.verification === 'object') {
    user.verification = mergeVerification(user.verification, body.verification);
    user.markModified('verification');
  }

  await user.save();

  res.json({ success: true, user: sessionPayload(user) });
});

/** GET /api/auth/users/:id - public profile of any member. */
const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const Review = require('../models/Review');
  const reviews = await Review.find({ reviewee: user._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('reviewer', 'name avatarUrl')
    .lean();

  res.json({ success: true, user: user.toPublicProfile(), reviews });
});

module.exports = { register, login, getMe, updateMe, getPublicProfile, sessionPayload };
