const express = require('express');
const router = express.Router();
const controller = require('../controllers/doctorLeavesController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

/**
 * Doctor days off (mounted at /api/doctor-leaves). See doctorLeavesController for the rules.
 */

// Public: dates to grey out in booking calendars (no reasons exposed)
router.get('/public', controller.getPublicLeaves);

router.get('/', verifyToken, requireRole(['doctor', 'receptionist', 'admin']), controller.listLeaves);
router.post('/', verifyToken, requireRole(['doctor', 'admin']), controller.createLeave);
router.delete('/:id', verifyToken, requireRole(['doctor', 'admin']), controller.deleteLeave);

module.exports = router;
