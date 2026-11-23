const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationsController');
const { verifyToken } = require('../middleware/authMiddleware');

// In-app notifications for the logged-in user (mounted at /api/notifications)
router.get('/', verifyToken, controller.getNotifications);

module.exports = router;
