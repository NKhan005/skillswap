'use strict';

const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/matchingController');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.getDirectMatches);
router.get('/nearby', ctrl.getNearbyMatches);
router.get('/explore', ctrl.explore);
router.get('/skills', ctrl.getSkillCatalog);

module.exports = router;
