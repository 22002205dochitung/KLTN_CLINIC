const express = require('express');
const router = express.Router();
const medicinesController = require('../controllers/medicinesController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Catalogue: doctors prescribe from it, the cashier prices from it
router.get('/', requireRole(['doctor', 'receptionist', 'admin']), medicinesController.list);

// Stock management: admin only
router.post('/', requireRole('admin'), medicinesController.create);
router.put('/:id', requireRole('admin'), medicinesController.update);
router.delete('/:id', requireRole('admin'), medicinesController.remove);
router.post('/:id/import', requireRole('admin'), medicinesController.importStock);
router.post('/:id/adjust', requireRole('admin'), medicinesController.adjustStock);
router.get('/:id/movements', requireRole('admin'), medicinesController.movements);

module.exports = router;
