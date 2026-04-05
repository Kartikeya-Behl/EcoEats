require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/database');

const authRoutes = require('./routes/authRoutes');
const kitchenRoutes = require('./routes/kitchenRoutes');
const surplusRoutes = require('./routes/surplusRoutes');
const orderRoutes = require('./routes/orderRoutes');
const addressRoutes = require('./routes/addressRoutes');
const kitchenDashRoutes = require('./routes/kitchenDashRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve frontend static files (needed for PhonePe redirect back)
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
    res.send('Welcome to the EcoEats API!');
});

// Get distinct cuisines from kitchens
app.get('/api/cuisines', (req, res) => {
    db.db.all('SELECT DISTINCT cuisine FROM kitchens', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const all = new Set();
        rows.forEach(r => r.cuisine.split(', ').forEach(c => all.add(c.trim())));
        res.json([...all].sort());
    });
});

// Search surplus items
app.get('/api/search', (req, res) => {
    const q = req.query.q;
    if (!q) return res.json([]);
    const like = `%${q}%`;
    db.db.all(
        `SELECT s.*, k.name as kitchen_name, k.location as kitchen_location, k.lat as kitchen_lat, k.lng as kitchen_lng
         FROM surplus_food s JOIN kitchens k ON s.kitchen_id = k.id
         WHERE s.quantity > 0 AND (s.food_name LIKE ? OR k.name LIKE ? OR k.cuisine LIKE ?)`,
        [like, like, like],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
});

app.use('/api/auth', authRoutes);
app.use('/api/kitchens', kitchenRoutes);
app.use('/api/surplus', surplusRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/kitchen-dash', kitchenDashRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Kitchen detail + menu
app.get('/api/kitchen-menu/:id', (req, res) => {
    const kitchenId = req.params.id;
    db.db.get('SELECT * FROM kitchens WHERE id = ?', [kitchenId], (err, kitchen) => {
        if (err || !kitchen) return res.status(404).json({ error: 'Kitchen not found' });
        db.db.all('SELECT * FROM surplus_food WHERE kitchen_id = ? AND quantity > 0', [kitchenId], (err2, items) => {
            if (err2) return res.status(500).json({ error: 'DB error' });
            const now = new Date();
            const processed = items.map(item => {
                const closingDate = new Date(item.closing_time);
                const diffMins = (closingDate - now) / 60000;
                let discount = 20;
                if (diffMins <= 0) discount = 80;
                else if (diffMins <= 30) discount = 60;
                else if (diffMins <= 60) discount = 40;
                const finalPrice = Math.round(item.original_price * (1 - discount / 100));
                return { ...item, discountPercentage: discount, finalPrice, discount_percentage: discount };
            });
            res.json({ kitchen, items: processed });
        });
    });
});

// === REVIEWS ===
const verifyToken = require('./middleware/authMiddleware');

app.post('/api/reviews', verifyToken, (req, res) => {
    const { kitchen_id, order_id, rating, comment } = req.body;
    if (!kitchen_id || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Valid kitchen_id and rating (1-5) required' });
    db.db.run('INSERT INTO reviews (user_id, kitchen_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, kitchen_id, order_id || null, rating, comment || ''],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save review' });
            res.status(201).json({ id: this.lastID, message: 'Review submitted!' });
        });
});

app.get('/api/reviews/:kitchenId', (req, res) => {
    db.db.all(`SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.kitchen_id = ? ORDER BY r.created_at DESC LIMIT 20`,
        [req.params.kitchenId], (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json(rows);
        });
});

app.get('/api/kitchen-ratings', (req, res) => {
    db.db.all(`SELECT kitchen_id, ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as review_count FROM reviews GROUP BY kitchen_id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        const map = {};
        rows.forEach(r => { map[r.kitchen_id] = { avg: r.avg_rating, count: r.review_count }; });
        res.json(map);
    });
});

// === FAVORITES ===
app.post('/api/favorites/toggle', verifyToken, (req, res) => {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id required' });
    db.db.get('SELECT id FROM favorites WHERE user_id = ? AND item_id = ?', [req.user.id, item_id], (err, row) => {
        if (row) {
            db.db.run('DELETE FROM favorites WHERE id = ?', [row.id], () => res.json({ favorited: false }));
        } else {
            db.db.run('INSERT INTO favorites (user_id, item_id) VALUES (?, ?)', [req.user.id, item_id], () => res.json({ favorited: true }));
        }
    });
});

app.get('/api/favorites', verifyToken, (req, res) => {
    db.db.all(`SELECT f.item_id, s.food_name, s.original_price, s.image_url, s.is_veg, s.kitchen_id, k.name as kitchen_name FROM favorites f JOIN surplus_food s ON f.item_id = s.id JOIN kitchens k ON s.kitchen_id = k.id WHERE f.user_id = ?`,
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json(rows);
        });
});

db.initDb((err) => {
    if (err) {
        console.error('Failed to initialize database', err);
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
