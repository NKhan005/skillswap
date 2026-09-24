'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

const router = express.Router();

// RFC 5321 caps an address at 254 characters. Checked before isEmail() so an
// oversized string is rejected by a length comparison rather than by pattern
// matching, whose cost grows with the input.
const emailField = (field) =>
  field
    .isLength({ max: 254 })
    .withMessage('Email address is too long')
    .bail()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail();

router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
    emailField(body('email')),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('coordinates').optional().isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [lng, lat]'),
  ],
  validate,
  ctrl.register
);

router.post(
  '/login',
  [
    emailField(body('email')),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  ctrl.login
);

router.get('/me', protect, ctrl.getMe);

router.put(
  '/me',
  protect,
  [
    body('name').optional().trim().isLength({ min: 2, max: 80 }),
    body('experienceLevel').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('coordinates').optional().isArray({ min: 2, max: 2 }),
  ],
  validate,
  ctrl.updateMe
);

router.get('/users/:id', protect, ctrl.getPublicProfile);

module.exports = router;
