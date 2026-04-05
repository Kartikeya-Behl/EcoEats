const express = require('express');
const router = express.Router();
const kitchenController = require('../controllers/kitchenController');

router.get('/', kitchenController.getKitchens);

module.exports = router;
