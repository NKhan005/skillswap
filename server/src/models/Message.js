'use strict';

const mongoose = require('mongoose');

/** Chat persistence behind the Socket.io rooms (feature 8). */
const messageSchema = new mongoose.Schema(
  {
    swap: { type: mongoose.Schema.Types.ObjectId, ref: 'SwapRequest', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    body: { type: String, required: true, trim: true, maxlength: 2000 },
    // 'system' rows narrate swap lifecycle events inside the thread.
    kind: { type: String, enum: ['text', 'system'], default: 'text' },

    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ swap: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, readAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
