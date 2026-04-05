const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const verifyToken = require('../middleware/authMiddleware');

// Initiate UPI payment (requires auth)
router.post('/initiate', verifyToken, paymentController.initiatePayment);

// PhonePe redirect callback (public — user comes back from PhonePe)
router.get('/callback', paymentController.handlePaymentCallback);

// PhonePe server-to-server webhook (public)
router.post('/webhook', paymentController.handleWebhook);

// Check payment status (requires auth)
router.get('/status/:txnId', verifyToken, paymentController.checkPaymentStatus);

module.exports = router;
