const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// requireRole needs req.user, so the token must be verified first (was missing -> always 401)
router.use(verifyToken);

/**
 * Statistics Routes
 * Handles appointment statistics and reporting for administrators
 * 
 * Requirements Validation:
 * - Requirement 18: Appointment Statistics Reporting
 * - Requirement 19: No-Show Rate Reporting
 * 
 * All routes require admin role
 */

/**
 * GET /api/statistics/appointments
 * Get comprehensive appointment statistics
 * Query params: start_date, end_date, department_id, doctor_id
 * Auth: Admin only
 */
router.get('/appointments',
    requireRole(['admin']),
    statisticsController.getAppointmentStatistics
);

/**
 * GET /api/statistics/no-show
 * Get no-show rate statistics
 * Query params: start_date, end_date, department_id, doctor_id
 * Auth: Admin only
 */
router.get('/no-show',
    requireRole(['admin']),
    statisticsController.getNoShowStatistics
);

/**
 * GET /api/statistics/dashboard
 * Get dashboard overview with key metrics
 * Auth: Admin only
 */
router.get('/dashboard',
    requireRole(['admin']),
    statisticsController.getDashboardOverview
);

module.exports = router;
