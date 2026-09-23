'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/reviewController');

const router = express.Router();

router.use(protect);

router.post(
  '/',
  [
    body('swapId').isMongoId().withMessage('A valid swap id is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('comment').optional().isLength({ max: 1000 }),
  ],
  validate,
  ctrl.createReview
);

router.get('/pending', ctrl.listPendingReviews);
router.get('/user/:userId', ctrl.listUserReviews);
router.get('/trust/:userId', ctrl.getTrustBreakdown);

module.exports = router;
