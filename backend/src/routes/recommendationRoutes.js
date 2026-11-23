const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { verifyToken, requireRole, optionalAuth } = require('../middleware/authMiddleware');

// Booking form (patients, guests, receptionists booking for someone)
router.get('/specialties', optionalAuth, recommendationController.specialties);
router.get('/slots', optionalAuth, recommendationController.slots);

// Admin: parameters, keywords, effectiveness, dry run
router.get('/settings', verifyToken, requireRole('admin'), recommendationController.getSettings);
router.put('/settings', verifyToken, requireRole('admin'), recommendationController.updateSettings);
router.get('/stats', verifyToken, requireRole('admin'), recommendationController.stats);
router.get('/preview', verifyToken, requireRole('admin'), recommendationController.preview);

module.exports = router;
