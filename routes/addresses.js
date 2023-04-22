const express = require('express');
const router = express.Router();
const db = require('../db');
const {authenticateToken} = require("../middlewares/auth")
const moment = require("moment")

// Route for adding a new address
router.post('/', authenticateToken, async (req, res) => {
    console.log(req.body); // Add this line to log the request body
    const { user_id, name, lat, lng } = req.body;

    const created_date = moment().format('YYYY-MM-DD HH:mm:ss');

    try {
        // Insert the new address into the Addresses table
        const [result] = await db.query('INSERT INTO Addresses (user_id, name, created_date, lat, lng) VALUES (?, ?, ?, ?, ?)', [
            user_id,
            name,
            created_date,
            lat,
            lng,
        ]);

        res.status(201).json({ message: 'Address created', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router
