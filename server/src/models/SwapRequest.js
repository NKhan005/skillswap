'use strict';

const mongoose = require('mongoose');

const SWAP_STATUSES = ['pending', 'accepted', 'completed', 'cancelled', 'declined'];

/**
 * A swap can settle two ways:
 *  - 'direct'  : both sides teach each other, no credits move.
 *  - 'credit'  : requester spends time credits, provider earns them.
 */
const SWAP_TYPES = ['direct', 'credit'];

const swapRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: { type: String, enum: SWAP_TYPES, default: 'direct' },
    status: { type: String, enum: SWAP_STATUSES, default: 'pending', index: true },

    // What the provider teaches the requester.
    skillRequested: { type: String, required: true, trim: true, maxlength: 60 },
    // What the requester teaches back - only meaningful for direct swaps.
    skillOffered: {
      type: String,
      trim: true,
      maxlength: 60,
      required: [
        function requiredForDirectSwap() {
          return this.type === 'direct';
        },
        'A direct swap needs a skill offered in return',
      ],
    },

    hours: { type: Number, required: true, min: 0.5, max: 12, default: 1 },
    // Credits locked at request time so later pricing changes cannot alter
    // an in-flight swap.
    creditCost: { type: Number, default: 0, min: 0 },

    message: { type: String, trim: true, maxlength: 1000, default: '' },
    meetingLocation: { type: String, trim: true, maxlength: 200, default: '' },
    scheduledAt: { type: Date },

    respondedAt: { type: Date },
    completedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String, trim: true, maxlength: 300, default: '' },

    // Each side confirms completion; the wallet only settles once both do.
    requesterConfirmed: { type: Boolean, default: false },
    providerConfirmed: { type: Boolean, default: false },

    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

swapRequestSchema.index({ requester: 1, status: 1 });
swapRequestSchema.index({ provider: 1, status: 1 });
swapRequestSchema.index({ createdAt: -1 });

/** Chat rooms are keyed on the swap id (feature 8). */
swapRequestSchema.virtual('roomId').get(function roomId() {
  return `swap:${this._id}`;
});

swapRequestSchema.virtual('isSettled').get(function isSettled() {
  return this.status === 'completed' || this.status === 'cancelled';
});

swapRequestSchema.methods.involves = function involves(userId) {
  const id = String(userId);
  return String(this.requester._id || this.requester) === id ||
    String(this.provider._id || this.provider) === id;
};

swapRequestSchema.methods.counterpartOf = function counterpartOf(userId) {
  const id = String(userId);
  return String(this.requester._id || this.requester) === id ? this.provider : this.requester;
};

const SwapRequest = mongoose.model('SwapRequest', swapRequestSchema);

SwapRequest.SWAP_STATUSES = SWAP_STATUSES;
SwapRequest.SWAP_TYPES = SWAP_TYPES;

module.exports = SwapRequest;
