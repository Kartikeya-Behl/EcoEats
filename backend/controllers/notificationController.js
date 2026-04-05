const db = require('../db/database');

const getNotifications = (req, res) => {
    const userId = req.user.id;
    // Get notifications where show_after is in the past or now
    db.db.all(`
        SELECT * FROM notifications 
        WHERE user_id = ? AND show_after <= datetime('now')
        ORDER BY created_at DESC 
        LIMIT 20
    `, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
};

const markAsRead = (req, res) => {
    const userId = req.user.id;
    db.db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND show_after <= datetime('now')`, [userId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Marked all as read' });
    });
};

module.exports = { getNotifications, markAsRead };
