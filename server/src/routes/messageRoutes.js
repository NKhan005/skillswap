'use strict';

const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/messageController');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listConversations);
router.get('/:swapId', ctrl.getThread);
router.post('/:swapId', ctrl.sendMessage);

module.exports = router;
