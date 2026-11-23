const express = require('express');
const router = express.Router();
const doctorShiftsController = require('../controllers/doctorShiftsController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', requireRole(['admin', 'receptionist', 'doctor']), doctorShiftsController.list);
router.post('/', requireRole('admin'), doctorShiftsController.create);
router.post('/template', requireRole('admin'), doctorShiftsController.applyTemplate);
router.delete('/:id', requireRole('admin'), doctorShiftsController.remove);

module.exports = router;
