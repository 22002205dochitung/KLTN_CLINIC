const express = require('express');
const router = express.Router();
const controller = require('../controllers/prescriptionTemplatesController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

/**
 * Prescription templates – đơn thuốc mẫu (mounted at /api/prescription-templates).
 * Doctors only; each doctor manages their own list. See the controller for the rules.
 */
const doctorOnly = [verifyToken, requireRole(['doctor'])];

router.get('/', ...doctorOnly, controller.list);
router.post('/', ...doctorOnly, controller.create);
router.put('/:id', ...doctorOnly, controller.update);
router.post('/:id/use', ...doctorOnly, controller.markUsed);
router.delete('/:id', ...doctorOnly, controller.remove);

module.exports = router;
