const express = require('express');
const router = express.Router();
const { register, login, getMe, deleteAccount, resetPassword, changePassword } = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.delete('/delete-account', verifyToken, deleteAccount);
router.post('/reset-password', resetPassword);
router.put('/change-password', verifyToken, changePassword);

module.exports = router;
