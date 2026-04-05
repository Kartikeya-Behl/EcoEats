const { db } = require('../db/database');

const getAddresses = (req, res) => {
    db.all('SELECT * FROM saved_addresses WHERE user_id = ?', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
};

const addAddress = (req, res) => {
    const { label, address, lat, lng } = req.body;
    if (!label || !address || lat == null || lng == null) {
        return res.status(400).json({ error: 'Please provide label, address, lat, lng' });
    }
    db.run('INSERT INTO saved_addresses (user_id, label, address, lat, lng) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, label, address, lat, lng],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save address' });
            res.status(201).json({ id: this.lastID, label, address, lat, lng });
        }
    );
};

const deleteAddress = (req, res) => {
    db.run('DELETE FROM saved_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Address deleted' });
    });
};

module.exports = { getAddresses, addAddress, deleteAddress };
