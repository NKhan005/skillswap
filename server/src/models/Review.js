'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    swap: { type: mongoose.Schema.Types.ObjectId, ref: 'SwapRequest', required: true, index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    rating: {
      type: Number,
      required: [true, 'A rating between 1 and 5 is required'],
      min: 1,
      max: 5,
    },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    skillTaught: { type: String, trim: true, maxlength: 60, default: '' },

    // Quick signals shown as chips on the profile.
    tags: [
      {
        type: String,
        enum: ['punctual', 'patient', 'knowledgeable', 'clear-communicator', 'well-prepared', 'friendly'],
      },
    ],
  },
  { timestamps: true }
);

// One review per reviewer per swap.
reviewSchema.index({ swap: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1, createdAt: -1 });

/**
 * Feature 4 - every write to a review re-derives the reviewee's trust score.
 * Required lazily to avoid a models <-> engine require cycle at load time.
 */
async function recalculate(revieweeId) {
  const { recalculateTrustScore } = require('../utils/trustScore');
  await recalculateTrustScore(revieweeId);
}

reviewSchema.post('save', async function afterSave(doc) {
  await recalculate(doc.reviewee);
});

reviewSchema.post('findOneAndDelete', async function afterDelete(doc) {
  if (doc) await recalculate(doc.reviewee);
});

module.exports = mongoose.model('Review', reviewSchema);
