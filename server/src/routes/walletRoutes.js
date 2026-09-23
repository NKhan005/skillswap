'use strict';

const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/walletController');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.getWallet);
router.get('/ledger', ctrl.getLedger);
router.get('/stats', ctrl.getWalletStats);

module.exports = router;
