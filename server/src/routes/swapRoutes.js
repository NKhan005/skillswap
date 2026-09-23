'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/swapController');

const router = express.Router();

router.use(protect);

router.post(
  '/',
  [
    body('providerId').isMongoId().withMessage('A valid provider id is required'),
    body('skillRequested').trim().notEmpty().withMessage('Name the skill you want to learn'),
    body('hours').optional().isFloat({ min: 0.5, max: 12 }).withMessage('Hours must be between 0.5 and 12'),
    body('type').optional().isIn(['direct', 'credit']),
  ],
  validate,
  ctrl.createSwap
);

router.get('/', ctrl.listSwaps);
router.get('/:id', ctrl.getSwap);

router.patch('/:id/accept', ctrl.acceptSwap);
router.patch('/:id/decline', ctrl.declineSwap);
router.patch('/:id/complete', ctrl.completeSwap);
router.patch('/:id/cancel', ctrl.cancelSwap);

module.exports = router;
