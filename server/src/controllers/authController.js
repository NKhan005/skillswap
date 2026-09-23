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

/** PUT /api/auth/me - profile, skills, location and verification links. */
const updateMe = asyncHandler(async (req, res) => {
  const user = req.user;
  const {
    name,
    bio,
    city,
    avatarUrl,
    experienceLevel,
    skillsOffered,
    skillsNeeded,
    coordinates,
    isAvailable,
    verification,
  } = req.body;

  if (name !== undefined) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (city !== undefined) user.city = city;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  if (experienceLevel !== undefined) user.experienceLevel = experienceLevel;
  if (Array.isArray(skillsOffered)) user.skillsOffered = skillsOffered;
  if (Array.isArray(skillsNeeded)) user.skillsNeeded = skillsNeeded;
  if (isAvailable !== undefined) user.isAvailable = Boolean(isAvailable);

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    user.location = { type: 'Point', coordinates: [Number(coordinates[0]), Number(coordinates[1])] };
  }

  // Feature 9 - merge verification links instead of replacing the subdocument,
  // so a partial update cannot wipe certifications the client did not send.
  if (verification && typeof verification === 'object') {
    const v = user.verification || {};
    for (const key of ['githubUrl', 'leetcodeUrl', 'portfolioUrl', 'linkedinUrl']) {
      if (verification[key] !== undefined) v[key] = verification[key];
    }
    if (Array.isArray(verification.certifications)) v.certifications = verification.certifications;
    if (Array.isArray(verification.projects)) v.projects = verification.projects;
    v.isVerified = Boolean(
      v.githubUrl || v.portfolioUrl || v.linkedinUrl || (v.certifications || []).length
    );
    user.verification = v;
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
