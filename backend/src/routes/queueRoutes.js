const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const { verifyToken, patientOnly, doctorOnly } = require('../middleware/authMiddleware');
const { globalRateLimit } = require('../middleware/rateLimitMiddleware');

/**
 * Queue Routes
 * Handles patient queue tracking and doctor queue management
 * 
 * Requirements Validation:
 * - Requirement 11: Queue Management After Check-In
 * - Requirement 12: Doctor Queue Viewing
 * - Custom: Real-time Queue Tracking for Patients
 */

/**
 * GET /api/queue/position/:appointmentId
 * Get current queue position for an appointment
 */
router.get('/position/:appointmentId',
    verifyToken,
    queueController.getQueuePosition
);

/**
 * GET /api/queue/my-position/:appointmentId
 * Alias for patient queue tracking
 */
// Lobby screen: today's queue per doctor (public, masked names)
router.get('/board', queueController.getQueueBoard);
// MP3 of the current call of a doctor (FPT.AI voice) for the lobby loudspeaker
router.get('/call-audio/:doctorId', queueController.getCallAudio);
// Check-in desk: voice in use + spoken result of a scan (fixed sentences only)
router.get('/voice', queueController.getVoice);
router.get('/checkin-audio', globalRateLimit, queueController.getCheckinAudio);

// Doctor's calling desk (hospital style): call next / call a specific number / recall / absent
router.get('/console', doctorOnly, queueController.getDoctorConsole);
router.post('/call-next', doctorOnly, queueController.callNext);
router.post('/call/:appointmentId', doctorOnly, queueController.callPatient);
router.post('/recall', doctorOnly, queueController.recall);
router.post('/skip', doctorOnly, queueController.skip);

// Expected time to be seen today (patient: own appointment; staff: any)
router.get('/estimate/:appointmentId',
    verifyToken,
    queueController.getWaitEstimate
);

router.get('/my-position/:appointmentId',
    verifyToken,
    queueController.getQueuePosition
);

/**
 * GET /api/queue/doctor/:doctorId
 * Get doctor's queue (all checked-in patients)
 * Auth: Doctor only
 */
router.get('/doctor/:doctorId',
    doctorOnly,
    queueController.getQueueForDoctor
);

/**
 * GET /api/queue/stats/:doctorId
 * Get queue statistics for a doctor
 */
router.get('/stats/:doctorId',
    verifyToken,
    queueController.getQueueStats
);

/**
 * POST /api/queue/remove/:appointmentId
 * Remove appointment from queue (mark as completed)
 */
router.post('/remove/:appointmentId',
    doctorOnly,
    queueController.removeFromQueue
);

module.exports = router;
