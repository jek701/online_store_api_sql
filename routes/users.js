const express = require('express');
const router = express.Router();
const dotenv = require("dotenv")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const {authenticateToken, isAdmin} = require('../middlewares/auth');

const User = require('../models/user_model');
const Address = require("../models/address_model")

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
const saltRounds = 10;

router.post('/register', async (req, res) => {
    const {login, password, email, number, name} = req.body;

    if (!login || !password) {
        return res.status(400).json({error: 'Missing login or password'});
    }

    try {
        // Check if the user already exists
        const existingUser = await User.findOne({where: {login}});

        if (existingUser) {
            return res.status(409).json({error: 'User already exists'});
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert the new user into the database using the User model
        const newUser = await User.create({
            login,
            password: hashedPassword,
            email,
            number,
            name,
        });

        // Send a response with the new user's ID
        res.status(201).json({id: newUser.id});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});

router.post('/authenticate', async (req, res) => {
    const {login, password} = req.body;

    if (!login || !password) {
        return res.status(400).json({error: 'Missing login or password'});
    }

    try {
        const user = await User.findOne({where: {login}});

        if (!user) {
            return res.status(404).json({error: 'User not found'});
        }

        // Check if the provided password matches the hashed password in the database
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({error: 'Invalid password'});
        }

        // Generate a JWT token
        const token = jwt.sign({id: user.id, login: user.login, role: user.role}, jwtSecret, {
            expiresIn: '365d',
        });

        delete user.password;
        // Remove the password from the user object

        // Send the JWT token, user info, and addresses in the response
        res.json({token});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});


router.get('/', isAdmin, async (req, res) => {
    try {
        const users = await User.findAll()
        res.json(users);
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    const id = req.user.id;

    try {
        // Fetch user and addresses using Sequelize
        const user = await User.findOne({
            where: {id},
            attributes: ["id", "login", "email", "role", "name", "number"],
            include: [
                {
                    model: Address,
                    attributes: ["id", "name", "lat", "lng"]
                }
            ]
        });

        if (!user) {
            return res.status(404).json({error: 'User not found'});
        }

        const userData = user.toJSON();
        const addresses = userData.Addresses;
        delete userData.Addresses;

        res.json({user: userData, addresses});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});


router.put('/me', authenticateToken, async (req, res) => {
    const id = req.user.id;
    const requestingUser = req.user;
    const {password, name, email, number} = req.body;

    // Check if the requesting user is an admin or updating their own information
    if (requestingUser.role !== 'admin' && requestingUser.id !== parseInt(id, 10)) {
        return res.status(403).json({error: 'Insufficient permissions'});
    }

    try {
        // Check if the user exists
        const user = await User.findOne({where: {id}});

        if (!user) {
            return res.status(404).json({error: 'User not found'});
        }

        // Update the user information
        const updateData = {};

        if (name) {
            updateData.name = name;
        }

        if (email) {
            updateData.email = email;
        }

        if (number) {
            updateData.number = number;
        }

        if (password) {
            updateData.password = await bcrypt.hash(password, saltRounds);
        }

        // Update the user in the database
        await User.update(updateData, {where: {id}});

        res.status(200).json({message: 'User information updated'});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
});

// Add more routes for /users/{id} (GET, PUT)

module.exports = router;
