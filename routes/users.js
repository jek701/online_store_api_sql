const express = require('express');
const router = express.Router();
const db = require('../db');
const dotenv = require("dotenv")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const { authenticateToken, requireRole } = require('../middlewares/auth');

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
const saltRounds = 20;

router.post('/register', async (req, res) => {
    const { login, password, email, number, name } = req.body;

    if (!login || !password) {
        return res.status(400).json({ error: 'Missing login or password' });
    }

    try {
        // Check if the user already exists
        const [existingUsers] = await db.query('SELECT * FROM Users WHERE login = ?', [login]);

        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert the new user into the database
        const [result] = await db.query('INSERT INTO Users (login, password, email, number, name) VALUES (?, ?, ?, ?, ?)', [
            login,
            hashedPassword,
            email,
            number,
            name
        ]);

        // Send a response with the new user's ID
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/authenticate', async (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
        return res.status(400).json({ error: 'Missing login or password' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM Users WHERE login = ?', [login]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];

        // Check if the provided password matches the hashed password in the database
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Generate a JWT token
        const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, jwtSecret, {
            expiresIn: '1h',
        });

        // Send the JWT token in the response
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    const requestingUser = req.user;

    // Check if the requesting user is an admin or requesting their own information
    if (requestingUser.role !== 'admin' && requestingUser.id !== parseInt(userId, 10)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM Users WHERE id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];

        // Remove sensitive data before sending the response
        delete user.password;

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    const requestingUser = req.user;
    const { password, name, email, number } = req.body;

    // Check if the requesting user is an admin or updating their own information
    if (requestingUser.role !== 'admin' && requestingUser.id !== parseInt(userId, 10)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
        // Check if the user exists
        const [rows] = await db.query('SELECT * FROM Users WHERE id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update the user information
        const updateData = {};

        if (name) {
            updateData.name = name;
        }

        if (email) {
            updateData.email = email
        }

        if (number) {
            updateData.number = number
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateData.password = hashedPassword;
        }

        // Update the user in the database
        await db.query('UPDATE Users SET ? WHERE id = ?', [updateData, userId]);

        res.status(200).json({ message: 'User information updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add more routes for /users/{id} (GET, PUT)

module.exports = router;
