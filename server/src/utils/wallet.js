'use strict';

const mongoose = require('mongoose');
const ApiError = require('./ApiError');
const logger = require('./logger');

/**
 * Features 6 and 7 - time-credit wallet.
 *
 * Every balance change goes through `postTransaction`, which writes the
 * immutable ledger row and the wallet totals together. Balances are moved with
 * an atomic `$inc` guarded by a balance precondition, so two concurrent spends
 * cannot both pass the check and overdraw the wallet.
 */

const DEBIT_TYPES = new Set(['spent']);

/**
 * Apply one ledger entry.
 * @param {object} params
 * @param {string} params.userId       wallet owner
 * @param {string} params.type         'earned' | 'spent' | 'challenge_reward' | 'signup_bonus' | 'refund'
 * @param {number} params.amount       positive credit amount
 * @param {string} [params.description]
 * @param {string} [params.counterpartyId]
 * @param {string} [params.swapId]
 * @param {string} [params.challengeId]
 * @param {import('mongoose').ClientSession} [params.session]
 */
async function postTransaction({
  userId,
  type,
  amount,
  description = '',
  counterpartyId = null,
  swapId = null,
  challengeId = null,
  session = null,
}) {
  const User = mongoose.model('User');
  const Transaction = mongoose.model('Transaction');

  if (!(amount > 0)) throw new ApiError(400, 'Transaction amount must be positive');

  const isDebit = DEBIT_TYPES.has(type);
  const delta = isDebit ? -amount : amount;

  // Guard the debit inside the query itself so the balance check and the
  // decrement are one atomic operation.
  const filter = isDebit
    ? { _id: userId, 'wallet.balance': { $gte: amount } }
    : { _id: userId };

  const update = isDebit
    ? { $inc: { 'wallet.balance': delta, 'wallet.totalSpent': amount } }
    : { $inc: { 'wallet.balance': delta, 'wallet.totalEarned': amount } };

  const user = await User.findOneAndUpdate(filter, update, {
    new: true,
    session,
  });

  if (!user) {
    const exists = await User.exists({ _id: userId });
    if (!exists) throw new ApiError(404, 'Wallet owner not found');
    throw new ApiError(400, 'Insufficient credit balance for this transaction');
  }

  const [transaction] = await Transaction.create(
    [
      {
        user: userId,
        counterparty: counterpartyId,
        type,
        amount,
        balanceAfter: user.wallet.balance,
        swap: swapId,
        challenge: challengeId,
        description,
      },
    ],
    { session, ordered: true }
  );

  logger.debug(`Ledger: ${type} ${amount} credits for ${userId} -> balance ${user.wallet.balance}`);

  return { transaction, wallet: user.wallet };
}

/**
 * Move credits from one member to another for a credit-settled swap.
 * The debit runs first: if the payer is short, nothing has moved yet.
 */
async function transferCredits({ fromUserId, toUserId, amount, swapId, skill = '' }) {
  const label = skill ? ` for ${skill}` : '';

  const debit = await postTransaction({
    userId: fromUserId,
    type: 'spent',
    amount,
    counterpartyId: toUserId,
    swapId,
    description: `Spent ${amount} credit(s)${label}`,
  });

  try {
    const credit = await postTransaction({
      userId: toUserId,
      type: 'earned',
      amount,
      counterpartyId: fromUserId,
      swapId,
      description: `Earned ${amount} credit(s)${label}`,
    });
    return { debit, credit };
  } catch (err) {
    // Compensate rather than leave credits destroyed - the ledger is
    // append-only, so the reversal is its own row.
    logger.error(`Credit leg failed for swap ${swapId}, refunding payer: ${err.message}`);
    await postTransaction({
      userId: fromUserId,
      type: 'refund',
      amount,
      counterpartyId: toUserId,
      swapId,
      description: `Refund: transfer${label} could not be completed`,
    });
    throw err;
  }
}

/** Wallet summary plus recent ledger rows, for the Skill Wallet screen. */
async function getWalletSummary(userId, limit = 25) {
  const User = mongoose.model('User');
  const Transaction = mongoose.model('Transaction');

  const user = await User.findById(userId).select('wallet');
  if (!user) throw new ApiError(404, 'User not found');

  const transactions = await Transaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('counterparty', 'name avatarUrl')
    .populate('swap', 'skillRequested skillOffered status')
    .lean();

  return {
    balance: user.wallet.balance,
    totalEarned: user.wallet.totalEarned,
    totalSpent: user.wallet.totalSpent,
    transactions,
  };
}

module.exports = { postTransaction, transferCredits, getWalletSummary };
