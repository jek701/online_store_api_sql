const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, isAdmin} = require('../middlewares/auth');

const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'canceled']

// Route for creating a new order
router.post('/', authenticateToken, async (req, res) => {
    const { user_id, total_price, delivery_type, address_lat, address_lng, items } = req.body;

    try {

        // Insert the new order into the Orders table
        const [orderResult] = await db.query(
            'INSERT INTO Orders (user_id, total_price, delivery_type, address_lat, address_lng) VALUES (?, ?, ?, ?, ?)',
            [user_id, total_price, delivery_type, address_lat, address_lng]
        );

        const orderId = orderResult.insertId;

        // Insert the order items into the OrderItems table
        const orderItemsPromises = items.map((item) =>
            db.query('INSERT INTO OrderItems (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)', [
                orderId,
                item.id,
                item.quantity,
                item.price,
            ])
        );

        await Promise.all(orderItemsPromises);

        // Commit the transaction
        await db.query('COMMIT');

        res.status(201).json({ message: 'Order created', order_id: orderId });
    } catch (err) {
        // Rollback the transaction in case of errors
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// Route for getting all orders for a specific user
router.get('/user/:user_id', authenticateToken, async (req, res) => {
    const user_id = req.params.user_id;

    try {
        // Fetch orders for the specified user
        const [orders] = await db.query('SELECT * FROM Orders WHERE user_id = ?', [user_id]);

        // Fetch order items for each order and add them to the order object
        const ordersWithItemsPromises = orders.map(async (order) => {
            const [items] = await db.query(
                'SELECT OrderItems.*, Products.name as product_name, Products.description as product_description FROM OrderItems JOIN Products ON OrderItems.product_id = Products.id WHERE order_id = ?',
                [order.order_id]
            );
            return { ...order, items };
        });

        const ordersWithItems = await Promise.all(ordersWithItemsPromises);

        res.json(ordersWithItems);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route to change Order info (items and status params ONLY), for Admin
router.put('/:order_id', isAdmin, async (req, res) => {
    const orderId = req.params.order_id;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Missing status' });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed values are: ${allowedStatuses.join(', ')}` });
    }

    if (!status) {
        return res.status(400).json({ error: 'Missing status' });
    }

    try {
        const [result] = await db.query('UPDATE Orders SET status = ? WHERE order_id = ?', [status, orderId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.status(200).json({ message: 'Order updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:order_id', authenticateToken, async (req, res) => {
    const orderId = req.params.order_id;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        const [rows] = await db.query('SELECT * FROM Orders WHERE order_id = ?', [orderId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = rows[0];

        if (userRole !== 'admin' && order.user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not have access to this order' });
        }

        res.status(200).json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;