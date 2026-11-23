const express = require('express');
const router = express.Router();
const doctorDirectoryController = require('../controllers/doctorDirectoryController');

// Public: search specialties / doctors and view a doctor's profile and free days
router.get('/', doctorDirectoryController.search);
router.get('/:id', doctorDirectoryController.profile);

module.exports = router;
