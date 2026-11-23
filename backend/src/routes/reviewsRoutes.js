const express = require('express');
const router = express.Router();
const controller = require('../controllers/reviewsController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// Visit reviews (mounted at /api/reviews)
router.post('/', verifyToken, requireRole(['patient']), controller.upsertReview);
router.get('/mine', verifyToken, requireRole(['patient']), controller.myReviews);
router.get('/summary', verifyToken, requireRole(['doctor', 'admin']), controller.summary);

module.exports = router;
