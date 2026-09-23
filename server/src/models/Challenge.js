'use strict';

const mongoose = require('mongoose');

/**
 * Feature 10 - community challenges. Progress is measured against a metric
 * the swap/review pipeline already tracks, so a challenge never needs its own
 * bookkeeping: `evaluateChallenges` reads the user's live counters.
 */
const CHALLENGE_METRICS = [
  'completed_swaps', // finish N swaps
  'people_taught', // teach N distinct people
  'reviews_received', // collect N reviews
  'hours_taught', // teach N hours
];

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    progress: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    rewarded: { type: Boolean, default: false },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    metric: { type: String, enum: CHALLENGE_METRICS, required: true },
    target: { type: Number, required: true, min: 1 },
    rewardCredits: { type: Number, required: true, min: 0, default: 10 },

    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },

    participants: { type: [participantSchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

challengeSchema.virtual('participantCount').get(function participantCount() {
  return this.participants.length;
});

challengeSchema.methods.participantFor = function participantFor(userId) {
  return this.participants.find((p) => String(p.user) === String(userId));
};

const Challenge = mongoose.model('Challenge', challengeSchema);

Challenge.CHALLENGE_METRICS = CHALLENGE_METRICS;

module.exports = Challenge;
