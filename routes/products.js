const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const {isAdmin} = require("../middlewares/auth")

// Set up multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    },
});

const upload = multer({ storage: storage });

// Route for getting all products
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Products');
        const products = rows.map(async (product) => {
            const [images] = await db.query('SELECT image_url FROM ProductImages WHERE product_id = ?', [product.id]);
            return {
                ...product,
                key_words: product.key_words.split(", "),
                images: images.map((image) => image.image_url),
            };
        });

        // Wait for all products' images to be fetched
        const productsWithImages = await Promise.all(products);

        res.json(productsWithImages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const [productRows] = await db.query('SELECT * FROM Products WHERE id = ?', [productId]);

        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = productRows[0];

        const [imageRows] = await db.query('SELECT image_url FROM ProductImages WHERE product_id = ?', [productId]);
        const images = imageRows.map((image) => image.image_url);

        res.json({
            ...product,
            images,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', isAdmin, upload.array('images'), async (req, res) => {
    const { name, description, price, quantity_in_stock } = req.body;
    const files = req.files;

    try {
        // Insert the new product into the Products table
        const [result] = await db.query('INSERT INTO Products (name, description, price, quantity_in_stock) VALUES (?, ?, ?, ?)', [
            name,
            description,
            price,
            quantity_in_stock,
        ]);

        const productId = result.insertId;

        // Process the uploaded images
        if (files && files.length > 0) {
            const imageRows = files.map((file) => [productId, `http://localhost:${process.env.PORT}/uploads/${file.filename}`]);
            await db.query('INSERT INTO ProductImages (product_id, image_url) VALUES ?', [imageRows]);
        }

        res.status(201).json({ message: 'Product created', id: productId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/image_urls', isAdmin, async (req, res) => {
    const { name, description, price, quantity_in_stock, imageUrl } = req.body;

    try {
        // Insert the new product into the Products table
        const [result] = await db.query('INSERT INTO Products (name, description, price, quantity_in_stock) VALUES (?, ?, ?, ?)', [
            name,
            description,
            price,
            quantity_in_stock,
        ]);

        const productId = result.insertId;

        const imageUrls = imageUrl.split(",")

        // Process the image URLs
        if (imageUrls && imageUrls.length > 0) {
            const imageRows = imageUrls.map((imageUrl) => [productId, imageUrl]);
            await db.query('INSERT INTO ProductImages (product_id, image_url) VALUES ?', [imageRows]);
        }

        res.status(201).json({ message: 'Product created', id: productId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.put('/:id', isAdmin, upload.array('images'), async (req, res) => {
    const productId = req.params.id;
    const { name, description, price, quantity_in_stock } = req.body;
    const files = req.files;

    try {
        // Prepare the update query with only the provided fields
        const updateData = [];
        let updateQuery = 'UPDATE Products SET';

        if (name !== undefined) {
            updateQuery += ' name = ?,';
            updateData.push(name);
        }

        if (description !== undefined) {
            updateQuery += ' description = ?,';
            updateData.push(description);
        }

        if (price !== undefined) {
            updateQuery += ' price = ?,';
            updateData.push(price);
        }

        if (quantity_in_stock !== undefined) {
            updateQuery += ' quantity_in_stock = ?,';
            updateData.push(quantity_in_stock);
        }

        // Remove trailing comma and add the WHERE clause
        updateQuery = updateQuery.slice(0, -1) + ' WHERE id = ?';
        updateData.push(productId);

        // Update the product in the Products table
        await db.query(updateQuery, updateData);

        // Process the uploaded images (if any)
        if (files && files.length > 0) {
            // Delete existing images from the ProductImages table
            await db.query('DELETE FROM ProductImages WHERE product_id = ?', [productId]);

            // Insert the new images into the ProductImages table
            const imageRows = files.map((file) => [productId, path.join('/uploads', file.filename)]);
            await db.query('INSERT INTO ProductImages (product_id, image_url) VALUES ?', [imageRows]);
        }

        res.status(200).json({ message: 'Product updated', id: productId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:product_id', isAdmin, async (req, res) => {
    const productId = req.params.product_id;

    try {
        // Check if the product exists
        const [rows] = await db.query('SELECT * FROM Products WHERE id = ?', [productId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete the product
        await db.query('DELETE FROM Products WHERE id = ?', [productId]);

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
