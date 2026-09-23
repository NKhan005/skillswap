'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

const SKILL_CATEGORIES = [
  'Technology',
  'Design',
  'Languages',
  'Music',
  'Academics',
  'Fitness',
  'Business',
  'Crafts',
  'Cooking',
  'Other',
];

/** A skill a user can teach. */
const skillOfferedSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    category: { type: String, enum: SKILL_CATEGORIES, default: 'Other' },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, default: 'intermediate' },
    yearsOfExperience: { type: Number, min: 0, max: 60, default: 0 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: true }
);

/** A skill a user wants to learn. */
const skillNeededSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    category: { type: String, enum: SKILL_CATEGORIES, default: 'Other' },
    urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: true }
);

/** Feature 9 - skill verification evidence. */
const verificationSchema = new mongoose.Schema(
  {
    githubUrl: { type: String, trim: true, default: '' },
    leetcodeUrl: { type: String, trim: true, default: '' },
    portfolioUrl: { type: String, trim: true, default: '' },
    linkedinUrl: { type: String, trim: true, default: '' },
    certifications: [
      {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        issuer: { type: String, trim: true, maxlength: 120, default: '' },
        credentialUrl: { type: String, trim: true, default: '' },
        issuedAt: { type: Date },
      },
    ],
    projects: [
      {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        url: { type: String, trim: true, default: '' },
        summary: { type: String, trim: true, maxlength: 500, default: '' },
      },
    ],
    isVerified: { type: Boolean, default: false },
  },
  { _id: false }
);

/** Feature 7 - skill wallet totals, kept in sync with the Transaction ledger. */
const walletSchema = new mongoose.Schema(
  {
    balance: { type: Number, default: env.SIGNUP_BONUS_CREDITS, min: 0 },
    totalEarned: { type: Number, default: env.SIGNUP_BONUS_CREDITS, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/** Feature 4 - raw inputs the trust engine folds into trustScore. */
const trustStatsSchema = new mongoose.Schema(
  {
    completedSwaps: { type: Number, default: 0, min: 0 },
    totalReviews: { type: Number, default: 0, min: 0 },
    positiveReviews: { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    requestsReceived: { type: Number, default: 0, min: 0 },
    requestsResponded: { type: Number, default: 0, min: 0 },
    responseRate: { type: Number, default: 0, min: 0, max: 1 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    avatarUrl: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, maxlength: 600, default: '' },
    city: { type: String, trim: true, default: '' },

    // Feature 3 - GeoJSON point driving $near radius matching.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
        validate: {
          validator: (v) =>
            v === undefined ||
            (Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 &&
              v[1] >= -90 &&
              v[1] <= 90),
          message: 'Coordinates must be [longitude, latitude] within valid ranges',
        },
      },
    },

    skillsOffered: { type: [skillOfferedSchema], default: [] },
    skillsNeeded: { type: [skillNeededSchema], default: [] },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, default: 'beginner' },

    verification: { type: verificationSchema, default: () => ({}) },
    wallet: { type: walletSchema, default: () => ({}) },
    trustStats: { type: trustStatsSchema, default: () => ({}) },
    trustScore: { type: Number, default: 0, min: 0, max: 100, index: true },

    challengesCompleted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Challenge' }],
    isAvailable: { type: Boolean, default: true },
    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// --- Indexes ---------------------------------------------------------------
userSchema.index({ location: '2dsphere' });
userSchema.index({ 'skillsOffered.name': 1 });
userSchema.index({ 'skillsNeeded.name': 1 });
userSchema.index({ 'skillsOffered.category': 1 });

// --- Virtuals --------------------------------------------------------------
userSchema.virtual('offeredSkillNames').get(function offeredSkillNames() {
  return (this.skillsOffered || []).map((s) => s.name.toLowerCase());
});

userSchema.virtual('neededSkillNames').get(function neededSkillNames() {
  return (this.skillsNeeded || []).map((s) => s.name.toLowerCase());
});

// --- Hooks -----------------------------------------------------------------
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

// Never persist a half-formed GeoJSON point: a 2dsphere index rejects an
// empty coordinates array and the whole save fails.
userSchema.pre('save', function stripEmptyLocation(next) {
  if (this.location && (!this.location.coordinates || this.location.coordinates.length !== 2)) {
    this.location = undefined;
  }
  return next();
});

// --- Methods ---------------------------------------------------------------
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublicProfile = function toPublicProfile() {
  const obj = this.toObject({ virtuals: false });
  delete obj.password;
  delete obj.email;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);

User.EXPERIENCE_LEVELS = EXPERIENCE_LEVELS;
User.SKILL_CATEGORIES = SKILL_CATEGORIES;

module.exports = User;
