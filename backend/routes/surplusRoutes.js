const express = require('express');
const router = express.Router();
const surplusController = require('../controllers/surplusController');

router.get('/', surplusController.getSurplus);
router.post('/', surplusController.addSurplus);

module.exports = router;
