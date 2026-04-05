const jwt = require('jsonwebtoken');
const jwtSecret = 'ecoeats_secret_token_123'; // Must match authController

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'Token is required' });

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    return next();
};

module.exports = verifyToken;
