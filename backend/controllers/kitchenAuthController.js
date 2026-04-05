const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

const jwtSecret = 'ecoeats_kitchen_secret_456';

const kitchenLogin = (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Please provide username and password' });
    }

    db.get(
        `SELECT ka.*, k.name as kitchen_name, k.location, k.cuisine 
         FROM kitchen_auth ka JOIN kitchens k ON ka.kitchen_id = k.id 
         WHERE ka.username = ?`,
        [username],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(401).json({ error: 'Invalid username or password' });

            if (!bcrypt.compareSync(password, row.password)) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const token = jwt.sign({ kitchenId: row.kitchen_id, username: row.username }, jwtSecret, { expiresIn: '7d' });
            res.json({
                token,
                kitchen: { id: row.kitchen_id, name: row.kitchen_name, location: row.location, cuisine: row.cuisine }
            });
        }
    );
};

// Middleware to verify kitchen token
const verifyKitchenToken = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token provided' });
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.kitchen = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Get kitchen's own surplus items
const getKitchenItems = (req, res) => {
    db.all('SELECT * FROM surplus_food WHERE kitchen_id = ? ORDER BY closing_time ASC',
        [req.kitchen.kitchenId], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
};

// Get kitchen's own orders
const getKitchenOrders = (req, res) => {
    db.all(
        `SELECT o.*, u.name as customer_name FROM orders o 
         LEFT JOIN users u ON o.user_id = u.id 
         WHERE o.kitchen_id = ? ORDER BY o.order_time DESC`,
        [req.kitchen.kitchenId], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            const parsed = rows.map(r => ({ ...r, items: JSON.parse(r.items_json) }));
            res.json(parsed);
        }
    );
};

// Get kitchen stats
const getKitchenStats = (req, res) => {
    const kitchenId = req.kitchen.kitchenId;
    db.get('SELECT COUNT(*) as totalItems, SUM(quantity) as totalStock FROM surplus_food WHERE kitchen_id = ?',
        [kitchenId], (err, itemStats) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.get('SELECT COUNT(*) as totalOrders, COALESCE(SUM(total_price),0) as totalRevenue FROM orders WHERE kitchen_id = ?',
                [kitchenId], (err2, orderStats) => {
                    if (err2) return res.status(500).json({ error: 'Database error' });
                    res.json({
                        totalItems: itemStats?.totalItems || 0,
                        totalStock: itemStats?.totalStock || 0,
                        totalOrders: orderStats?.totalOrders || 0,
                        totalRevenue: orderStats?.totalRevenue || 0
                    });
                }
            );
        }
    );
};

// Update item quantity
const updateItemQuantity = (req, res) => {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) {
        return res.status(400).json({ error: 'Valid quantity is required' });
    }

    db.run(
        'UPDATE surplus_food SET quantity = ? WHERE id = ? AND kitchen_id = ?',
        [quantity, itemId, req.kitchen.kitchenId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Item not found or unauthorized' });
            res.json({ message: 'Quantity updated successfully' });
        }
    );
};

module.exports = { kitchenLogin, verifyKitchenToken, getKitchenItems, getKitchenOrders, getKitchenStats, updateItemQuantity };
