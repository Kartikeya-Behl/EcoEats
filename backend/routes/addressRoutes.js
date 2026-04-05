const express = require('express');
const router = express.Router();
const { getAddresses, addAddress, deleteAddress } = require('../controllers/addressController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAddresses);
router.post('/', verifyToken, addAddress);
router.delete('/:id', verifyToken, deleteAddress);

module.exports = router;
