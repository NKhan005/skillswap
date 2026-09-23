'use strict';

const express = require('express');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/matching', require('./matchingRoutes'));
router.use('/swaps', require('./swapRoutes'));
router.use('/reviews', require('./reviewRoutes'));
router.use('/wallet', require('./walletRoutes'));
router.use('/messages', require('./messageRoutes'));
router.use('/challenges', require('./challengeRoutes'));

module.exports = router;
