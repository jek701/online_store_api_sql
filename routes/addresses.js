const express = require('express');
const router = express.Router();
const db = require('../db');
const {authenticateToken} = require("../middlewares/auth")

const Address = require("../models/address_model")
// Route for adding a new address
router.post('/', authenticateToken, async (req, res) => {
    const {name, lat, lng } = req.body;
    const user_id = req.user.id

    try {
        // Insert the new address into the Addresses table
        const [result] = await db.query('INSERT INTO Addresses (user_id, name, lat, lng) VALUES (?, ?, ?, ?)', [
            user_id,
            name,
            lat,
            lng,
        ]);

        res.status(201).json({ message: 'Address created', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/user', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const requestingUser = req.user;

    // Check if the requesting user has permission to view the addresses
    if (requestingUser.role !== 'admin' && requestingUser.id !== parseInt(userId, 10)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
        const addresses = await Address.findAll({ where: { user_id: userId } });

        if (!addresses || addresses.length === 0) {
            return res.status(404).json({ error: 'No addresses found for the user' });
        }

        res.status(200).json({ addresses });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.delete('/:id', authenticateToken, async (req, res) => {
    const addressId = req.params.id;
    const requestingUser = req.user;

    try {
        // Fetch the address from the database
        const address = await Address.findOne({ where: { id: addressId } });

        if (!address) {
            return res.status(404).json({ error: 'Address not found' });
        }

        // Check if the requesting user has permission to delete the address
        if (requestingUser.role !== 'admin' && requestingUser.id !== address.user_id) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Delete the address
        await Address.destroy({ where: { id: addressId } });

        res.status(200).json({ message: 'Address deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router
