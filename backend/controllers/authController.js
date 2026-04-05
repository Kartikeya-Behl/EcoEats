const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

const jwtSecret = 'ecoeats_secret_token_123';

const register = (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Please provide name, email, and password' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (row) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = bcrypt.hashSync(password, 10);

        db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], function(err) {
            if (err) return res.status(500).json({ error: 'Failed to register user' });

            const token = jwt.sign({ id: this.lastID, email }, jwtSecret, { expiresIn: '7d' });
            res.status(201).json({ token, user: { id: this.lastID, name, email } });
        });
    });
};

const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide email and password' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
        res.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
};

const getMe = (req, res) => {
    db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
};

// Delete account and all associated data
const deleteAccount = (req, res) => {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) return res.status(400).json({ error: 'Password is required to delete account' });

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Delete user's data in order
        db.run('DELETE FROM saved_addresses WHERE user_id = ?', [userId]);
        db.run('DELETE FROM favorites WHERE user_id = ?', [userId]);
        db.run('DELETE FROM reviews WHERE user_id = ?', [userId]);
        db.run('DELETE FROM pending_payments WHERE user_id = ?', [userId]);
        db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to delete account' });
            res.json({ message: 'Account deleted successfully' });
        });
    });
};

// Reset password (simplified for demo — verify email, then set new password)
const resetPassword = (req, res) => {
    const { email, new_password } = req.body;

    if (!email || !new_password) {
        return res.status(400).json({ error: 'Email and new password are required' });
    }
    if (new_password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'No account found with this email' });

        const hashedPassword = bcrypt.hashSync(new_password, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to reset password' });
            res.json({ message: 'Password reset successfully. You can now sign in.' });
        });
    });
};

// Change password for logged in user
const changePassword = (req, res) => {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
        return res.status(400).json({ error: 'Both old and new password are required' });
    }
    if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!bcrypt.compareSync(old_password, user.password)) {
            return res.status(401).json({ error: 'Incorrect old password' });
        }

        const hashedPassword = bcrypt.hashSync(new_password, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to update password' });
            res.json({ message: 'Password changed successfully' });
        });
    });
};

module.exports = { register, login, getMe, deleteAccount, resetPassword, changePassword };
