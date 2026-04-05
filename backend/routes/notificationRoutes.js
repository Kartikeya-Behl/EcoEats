const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { getNotifications, markAsRead } = require('../controllers/notificationController');

router.get('/', verifyToken, getNotifications);
router.post('/read', verifyToken, markAsRead);

module.exports = router;
