// middlewares/auth.js

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const db = require('../db');

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    });
};

const requireRole = (role) => (req, res, next) => {
    if (req.user && req.user.role === role) {
        next();
    } else {
        res.status(403).json({ error: 'Insufficient permissions' });
    }
};

// Middleware function to check if the user is an admin
const isAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await db.query('SELECT * FROM Users WHERE id = ?', [decoded.id]);

        if (users.length === 0) {
            throw new Error();
        }

        const user = users[0];

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Requires admin privileges.' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Please authenticate.' });
    }
};

module.exports = {
    authenticateToken,
    requireRole,
    isAdmin
};
