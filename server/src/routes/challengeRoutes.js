'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/challengeController');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listChallenges);
router.get('/leaderboard', ctrl.getLeaderboard);
router.post('/:id/join', ctrl.joinChallenge);

router.post(
  '/',
  [
    body('title').trim().isLength({ min: 3, max: 120 }),
    body('metric').isIn(['completed_swaps', 'people_taught', 'reviews_received', 'hours_taught']),
    body('target').isInt({ min: 1 }),
    body('rewardCredits').optional().isFloat({ min: 0 }),
  ],
  validate,
  ctrl.createChallenge
);

module.exports = router;
