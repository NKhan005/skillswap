'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/** Pull a bearer token off the Authorization header. */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Require a valid JWT and attach the live user document as req.user. */
const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token missing');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token';
    throw ApiError.unauthorized(msg);
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  req.user = user;
  req.userId = String(user._id);

  // Cheap presence signal; skipped when it would just rewrite the same minute.
  const now = Date.now();
  if (!user.lastActiveAt || now - user.lastActiveAt.getTime() > 60_000) {
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date(now) } }).catch(() => {});
  }

  return next();
});

/** Attach req.user when a token is present, but never reject. */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    req.user = await User.findById(payload.sub);
    req.userId = req.user ? String(req.user._id) : null;
  } catch {
    // An unusable token is treated as no token on public routes.
  }
  return next();
});

module.exports = { protect, optionalAuth, signToken, verifyToken };
