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
            expiresIn: '365d',
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

    try {
        // Fetch user and addresses in a single query using JOIN
        const [rows] = await db.query(`
      SELECT 
        Users.id as user_id,
        Users.login,
        Users.email,
        Users.role,
        Addresses.id as address_id,
        Addresses.name as address_name,
        Addresses.created_date as address_created_date,
        Addresses.lat,
        Addresses.lng
      FROM Users
      LEFT JOIN Addresses ON Users.id = Addresses.user_id
      WHERE Users.id = ?
    `, [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Extract user data and addresses from the query result
        const { user_id, username, email, role } = rows[0];
        const user = { user_id, username, email, role, addresses: [] };

        rows.forEach(row => {
            if (row.address_id) {
                const { address_id, address_name, address_created_date, lat, lng } = row;
                user.addresses.push({ address_id, address_name, address_created_date, lat, lng });
            }
        });

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
            updateData.password = await bcrypt.hash(password, saltRounds);
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
