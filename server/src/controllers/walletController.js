'use strict';

const Transaction = require('../models/Transaction');
const asyncHandler = require('../utils/asyncHandler');
const { getWalletSummary } = require('../utils/wallet');

/** GET /api/wallet - feature 7, balance + recent ledger. */
const getWallet = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
  const summary = await getWalletSummary(req.user._id, limit);
  res.json({ success: true, wallet: summary });
});

/** GET /api/wallet/ledger - full paginated ledger. */
const getLedger = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  const [transactions, total] = await Promise.all([
    Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('counterparty', 'name avatarUrl')
      .populate('swap', 'skillRequested skillOffered hours status')
      .lean(),
    Transaction.countDocuments({ user: req.user._id }),
  ]);

  res.json({
    success: true,
    page,
    pages: Math.ceil(total / limit) || 1,
    total,
    transactions,
  });
});

/** GET /api/wallet/stats - credits earned vs spent over the last 6 months. */
const getWalletStats = asyncHandler(async (req, res) => {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const monthly = await Transaction.aggregate([
    { $match: { user: req.user._id, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } },
        earned: {
          $sum: { $cond: [{ $eq: ['$type', 'spent'] }, 0, '$amount'] },
        },
        spent: {
          $sum: { $cond: [{ $eq: ['$type', 'spent'] }, '$amount', 0] },
        },
      },
    },
    { $sort: { '_id.month': 1 } },
    { $project: { _id: 0, month: '$_id.month', earned: 1, spent: 1 } },
  ]);

  res.json({ success: true, monthly });
});

module.exports = { getWallet, getLedger, getWalletStats };
