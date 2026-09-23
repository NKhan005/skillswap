'use strict';

const mongoose = require('mongoose');

const TRANSACTION_TYPES = ['earned', 'spent', 'challenge_reward', 'signup_bonus', 'refund'];

/**
 * Append-only ledger for the time-credit economy (features 6 and 7).
 * Rows are never updated or deleted - a correction is a new compensating row,
 * which keeps wallet balances auditable.
 */
const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    counterparty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    // Always positive; `type` carries the direction.
    amount: { type: Number, required: true, min: 0 },
    // Wallet balance immediately after this row was applied.
    balanceAfter: { type: Number, required: true, min: 0 },

    swap: { type: mongoose.Schema.Types.ObjectId, ref: 'SwapRequest', default: null },
    challenge: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', default: null },

    description: { type: String, trim: true, maxlength: 300, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

transactionSchema.index({ user: 1, createdAt: -1 });

/** Credits flowing in vs out, for wallet summaries. */
transactionSchema.virtual('direction').get(function direction() {
  return this.type === 'spent' ? 'out' : 'in';
});

// Enforce immutability at the model layer rather than trusting call sites.
const blockMutation = function blockMutation(next) {
  next(new Error('Transactions are immutable; write a compensating entry instead'));
};

transactionSchema.pre('findOneAndUpdate', blockMutation);
transactionSchema.pre('updateOne', blockMutation);
transactionSchema.pre('updateMany', blockMutation);
transactionSchema.pre('findOneAndDelete', blockMutation);
transactionSchema.pre('deleteOne', { document: false, query: true }, blockMutation);

transactionSchema.pre('save', function blockEdits(next) {
  if (!this.isNew) return next(new Error('Transactions are immutable'));
  return next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

Transaction.TRANSACTION_TYPES = TRANSACTION_TYPES;

module.exports = Transaction;
