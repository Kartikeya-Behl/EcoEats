const express = require('express');
const router = express.Router();
const { kitchenLogin, verifyKitchenToken, getKitchenItems, getKitchenOrders, getKitchenStats, updateItemQuantity } = require('../controllers/kitchenAuthController');

router.post('/login', kitchenLogin);
router.get('/items', verifyKitchenToken, getKitchenItems);
router.put('/items/:itemId', verifyKitchenToken, updateItemQuantity);
router.get('/orders', verifyKitchenToken, getKitchenOrders);
router.get('/stats', verifyKitchenToken, getKitchenStats);

module.exports = router;
