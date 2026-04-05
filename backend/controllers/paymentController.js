const crypto = require('crypto');
const axios = require('axios');
const { db } = require('../db/database');

// PhonePe config
const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT';
const SALT_KEY = process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const PHONEPE_ENV = process.env.PHONEPE_ENV || 'SANDBOX';
const PHONEPE_API = PHONEPE_ENV === 'PRODUCTION'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

// === HELPERS ===

function generateChecksum(payload, endpoint) {
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const string = base64Payload + endpoint + SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    return { base64Payload, checksum: sha256 + '###' + SALT_INDEX };
}

function generateStatusChecksum(endpoint) {
    const string = endpoint + SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    return sha256 + '###' + SALT_INDEX;
}

function generateTxnId() {
    return 'ECOEATS_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// === INITIATE PAYMENT ===
const initiatePayment = (req, res) => {
    const userId = req.user.id;
    const { items, total_price, original_total, delivery_address, user_lat, user_lng } = req.body;

    if (!items || !items.length || !delivery_address) {
        return res.status(400).json({ error: 'Items and delivery address required' });
    }

    const merchantTransactionId = generateTxnId();
    const amountInPaise = Math.round((total_price || 0) * 100);

    // If amount is 0 (free order via coupon), skip payment — place directly
    if (amountInPaise <= 0) {
        return res.status(400).json({ error: 'Cannot process UPI payment for ₹0. Use COD instead.' });
    }

    // Store pending payment data
    const pendingData = JSON.stringify({
        user_id: userId,
        items,
        total_price,
        original_total,
        delivery_address,
        user_lat,
        user_lng,
        payment_method: 'UPI'
    });

    db.run(
        `INSERT INTO pending_payments (txn_id, user_id, order_data, amount_paise, status) VALUES (?, ?, ?, ?, 'INITIATED')`,
        [merchantTransactionId, userId, pendingData, amountInPaise],
        function(err) {
            if (err) {
                console.error('Failed to save pending payment:', err);
                return res.status(500).json({ error: 'Failed to initiate payment' });
            }

            // Build PhonePe payload
            const payload = {
                merchantId: MERCHANT_ID,
                merchantTransactionId: merchantTransactionId,
                merchantUserId: 'USER_' + userId,
                amount: amountInPaise,
                redirectUrl: `${BASE_URL}/api/payments/callback?txnId=${merchantTransactionId}`,
                redirectMode: 'REDIRECT',
                callbackUrl: `${BASE_URL}/api/payments/webhook`,
                paymentInstrument: {
                    type: 'PAY_PAGE'
                }
            };

            const { base64Payload, checksum } = generateChecksum(payload, '/pg/v1/pay');

            // Call PhonePe API
            axios.post(`${PHONEPE_API}/pg/v1/pay`, {
                request: base64Payload
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-VERIFY': checksum
                }
            })
            .then(response => {
                const phonePeData = response.data;

                if (phonePeData.success && phonePeData.data && phonePeData.data.instrumentResponse) {
                    const redirectUrl = phonePeData.data.instrumentResponse.redirectInfo.url;

                    // Update status
                    db.run(`UPDATE pending_payments SET status = 'PENDING' WHERE txn_id = ?`, [merchantTransactionId]);

                    res.json({
                        success: true,
                        redirectUrl: redirectUrl,
                        transactionId: merchantTransactionId
                    });
                } else {
                    db.run(`UPDATE pending_payments SET status = 'FAILED' WHERE txn_id = ?`, [merchantTransactionId]);
                    res.status(400).json({ error: 'PhonePe payment initiation failed', details: phonePeData });
                }
            })
            .catch(error => {
                console.error('PhonePe API error:', error.response?.data || error.message);
                db.run(`UPDATE pending_payments SET status = 'FAILED' WHERE txn_id = ?`, [merchantTransactionId]);
                res.status(500).json({ error: 'Failed to connect to PhonePe', details: error.response?.data || error.message });
            });
        }
    );
};

// === PAYMENT CALLBACK (user redirected here after PhonePe) ===
const handlePaymentCallback = (req, res) => {
    const txnId = req.query.txnId;

    if (!txnId) {
        return res.redirect('/cart.html?payment=failed&reason=missing_txn');
    }

    // Check payment status with PhonePe
    const statusEndpoint = `/pg/v1/status/${MERCHANT_ID}/${txnId}`;
    const checksum = generateStatusChecksum(statusEndpoint);

    axios.get(`${PHONEPE_API}${statusEndpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': MERCHANT_ID
        }
    })
    .then(response => {
        const data = response.data;

        if (data.success && data.code === 'PAYMENT_SUCCESS') {
            // Payment successful — create the actual order
            db.get('SELECT * FROM pending_payments WHERE txn_id = ?', [txnId], (err, pending) => {
                if (err || !pending) {
                    return res.redirect('/cart.html?payment=failed&reason=txn_not_found');
                }

                const orderData = JSON.parse(pending.order_data);
                createOrderFromPending(orderData, txnId, data.data?.transactionId || txnId, (error, orderId) => {
                    if (error) {
                        return res.redirect('/cart.html?payment=failed&reason=order_creation_failed');
                    }

                    // Mark payment as completed
                    db.run(`UPDATE pending_payments SET status = 'COMPLETED', phonepe_txn_id = ? WHERE txn_id = ?`,
                        [data.data?.transactionId || '', txnId]);

                    res.redirect(`/cart.html?payment=success&order=${orderId}&txn=${txnId}`);
                });
            });
        } else if (data.code === 'PAYMENT_PENDING') {
            db.run(`UPDATE pending_payments SET status = 'PENDING' WHERE txn_id = ?`, [txnId]);
            res.redirect(`/cart.html?payment=pending&txn=${txnId}`);
        } else {
            db.run(`UPDATE pending_payments SET status = 'FAILED' WHERE txn_id = ?`, [txnId]);
            res.redirect(`/cart.html?payment=failed&reason=${data.code || 'unknown'}`);
        }
    })
    .catch(error => {
        console.error('PhonePe status check error:', error.response?.data || error.message);
        res.redirect(`/cart.html?payment=failed&reason=status_check_error`);
    });
};

// === WEBHOOK (server-to-server callback from PhonePe) ===
const handleWebhook = (req, res) => {
    // PhonePe sends a base64 encoded response
    // Verify and process asynchronously (backup for redirect flow)
    try {
        const { response: b64Response } = req.body;
        if (b64Response) {
            const decoded = JSON.parse(Buffer.from(b64Response, 'base64').toString());
            const txnId = decoded.data?.merchantTransactionId;

            if (decoded.code === 'PAYMENT_SUCCESS' && txnId) {
                db.get('SELECT * FROM pending_payments WHERE txn_id = ? AND status != "COMPLETED"', [txnId], (err, pending) => {
                    if (!err && pending) {
                        const orderData = JSON.parse(pending.order_data);
                        createOrderFromPending(orderData, txnId, decoded.data?.transactionId || txnId, () => {
                            db.run(`UPDATE pending_payments SET status = 'COMPLETED', phonepe_txn_id = ? WHERE txn_id = ?`,
                                [decoded.data?.transactionId || '', txnId]);
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.error('Webhook processing error:', e);
    }
    res.json({ success: true });
};

// === CHECK PAYMENT STATUS (polled by frontend) ===
const checkPaymentStatus = (req, res) => {
    const txnId = req.params.txnId;

    db.get('SELECT status, phonepe_txn_id FROM pending_payments WHERE txn_id = ? AND user_id = ?',
        [txnId, req.user.id], (err, row) => {
            if (err || !row) return res.status(404).json({ error: 'Transaction not found' });
            res.json({ status: row.status, phonepe_txn_id: row.phonepe_txn_id });
        });
};

// === CREATE ORDER FROM PENDING PAYMENT DATA ===
function createOrderFromPending(orderData, merchantTxnId, phonePeTxnId, callback) {
    const { user_id, items, total_price, original_total, delivery_address, user_lat, user_lng } = orderData;

    const firstItemId = items[0].id;
    db.get(
        `SELECT k.id as kid, k.lat, k.lng FROM surplus_food sf JOIN kitchens k ON sf.kitchen_id = k.id WHERE sf.id = ?`,
        [firstItemId],
        (err, kitchen) => {
            if (err || !kitchen) {
                return callback(new Error('Kitchen not found'));
            }

            const kitchenId = kitchen.kid;
            const kLat = kitchen.lat;
            const kLng = kitchen.lng;
            const uLat = user_lat || 12.9716;
            const uLng = user_lng || 77.5946;

            // Haversine distance
            const R = 6371;
            const dLat = (uLat - kLat) * Math.PI / 180;
            const dLng = (uLng - kLng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(kLat * Math.PI/180) * Math.cos(uLat * Math.PI/180) *
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            const prepMins = 10;
            const travelMins = Math.ceil(distKm * 3);
            const totalMins = prepMins + travelMins;
            const estimatedTime = new Date(Date.now() + totalMins * 60000).toISOString();
            const orderTimeISO = new Date().toISOString();
            const itemsJson = JSON.stringify(items);

            // Random driver
            const DRIVERS = [
                { name: 'Rajesh Kumar',     phone: '+91 9XXXX XX210' },
                { name: 'Amit Sharma',      phone: '+91 8XXXX XX109' },
                { name: 'Priya Singh',      phone: '+91 7XXXX XX098' },
                { name: 'Deepak Reddy',     phone: '+91 6XXXX XX987' },
                { name: 'Sneha Patil',      phone: '+91 9XXXX XX876' },
                { name: 'Vikram Joshi',     phone: '+91 8XXXX XX765' },
                { name: 'Ananya Nair',      phone: '+91 7XXXX XX654' },
                { name: 'Mohammed Irfan',   phone: '+91 9XXXX XX543' },
            ];
            const driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];

            db.run(
                `INSERT INTO orders (user_id, kitchen_id, items_json, total_price, original_total, delivery_address, payment_method, driver_name, driver_phone, estimated_delivery_time, kitchen_lat, kitchen_lng, user_lat, user_lng, order_time)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, kitchenId, itemsJson, total_price || 0, original_total || 0, delivery_address, 'UPI (PhonePe)', driver.name, driver.phone, estimatedTime, kLat, kLng, uLat, uLng, orderTimeISO],
                function(err) {
                    if (err) return callback(err);

                    const orderId = this.lastID;
                    items.forEach(item => {
                        db.run('UPDATE surplus_food SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.id]);
                    });

                    callback(null, orderId);
                }
            );
        }
    );
}

module.exports = { initiatePayment, handlePaymentCallback, handleWebhook, checkPaymentStatus };
