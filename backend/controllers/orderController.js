const { db } = require('../db/database');

// Haversine formula to calculate distance in km
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Pool of dummy delivery drivers
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

function getRandomDriver() {
    return DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
}

const checkout = (req, res) => {
    const user_id = req.user.id;
    const { items, total_price, original_total, delivery_address, user_lat, user_lng, payment_method } = req.body;

    if (!items || !items.length || !delivery_address) {
        return res.status(400).json({ error: 'Please provide items and delivery address' });
    }

    const payMethod = (payment_method === 'UPI') ? 'UPI' : 'COD';

    // Get the first item's kitchen to determine kitchen location
    const firstItemId = items[0].id;
    db.get(
        `SELECT k.id as kid, k.lat, k.lng FROM surplus_food sf JOIN kitchens k ON sf.kitchen_id = k.id WHERE sf.id = ?`,
        [firstItemId],
        (err, kitchen) => {
            if (err || !kitchen) {
                return res.status(500).json({ error: 'Could not find kitchen location' });
            }

            const kitchenId = kitchen.kid;
            const kLat = kitchen.lat;
            const kLng = kitchen.lng;
            const uLat = user_lat || 12.9716;
            const uLng = user_lng || 77.5946;

            const distKm = haversine(kLat, kLng, uLat, uLng);
            const prepMins = 10;
            const travelMins = Math.ceil(distKm * 3);
            const totalMins = prepMins + travelMins;

            const estimatedTime = new Date(Date.now() + totalMins * 60000).toISOString();
            const orderTimeISO = new Date().toISOString();
            const itemsJson = JSON.stringify(items);

            const driver = getRandomDriver();

            db.run(
                `INSERT INTO orders (user_id, kitchen_id, items_json, total_price, original_total, delivery_address, payment_method, driver_name, driver_phone, estimated_delivery_time, kitchen_lat, kitchen_lng, user_lat, user_lng, order_time)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, kitchenId, itemsJson, total_price || 0, original_total || 0, delivery_address, payMethod, driver.name, driver.phone, estimatedTime, kLat, kLng, uLat, uLng, orderTimeISO],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Failed to create order' });

                    const orderId = this.lastID;
                    items.forEach(item => {
                        db.run('UPDATE surplus_food SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.id]);
                    });

                    // Generate scheduled notifications
                    const n_confirm = { title: 'Order Confirmed', msg: `Your order #${orderId} has been confirmed.`, time: orderTimeISO, type: 'alert' };
                    
                    const time10m = new Date(Date.now() + (totalMins - 10) * 60000).toISOString();
                    const n_10m = { title: 'Arriving Soon', msg: `Your order #${orderId} is arriving in 10 minutes!`, time: time10m, type: 'delivery' };
                    
                    const n_delivered = { title: 'Delivered', msg: `Your order #${orderId} has been delivered. Enjoy!`, time: estimatedTime, type: 'delivery' };

                    const nStmt = db.prepare('INSERT INTO notifications (user_id, title, message, type, show_after) VALUES (?, ?, ?, ?, ?)');
                    nStmt.run([user_id, n_confirm.title, n_confirm.msg, n_confirm.type, n_confirm.time]);
                    if (totalMins > 10) nStmt.run([user_id, n_10m.title, n_10m.msg, n_10m.type, n_10m.time]);
                    nStmt.run([user_id, n_delivered.title, n_delivered.msg, n_delivered.type, n_delivered.time]);
                    nStmt.finalize();

                    res.status(201).json({
                        message: 'Order placed',
                        order_id: orderId,
                        estimated_delivery_time: estimatedTime,
                        delivery_mins: totalMins,
                        payment_method: payMethod,
                        driver_name: driver.name,
                        driver_phone: driver.phone,
                        kitchen_lat: kLat, kitchen_lng: kLng,
                        user_lat: uLat, user_lng: uLng
                    });
                }
            );
        }
    );
};

const getMyOrders = (req, res) => {
    db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY order_time DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const parsed = rows.map(r => ({ ...r, items: JSON.parse(r.items_json) }));
        res.json(parsed);
    });
};

const getOrder = (req, res) => {
    db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'Order not found' });
        row.items = JSON.parse(row.items_json);
        res.json(row);
    });
};

module.exports = { checkout, getMyOrders, getOrder };
