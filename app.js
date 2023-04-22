const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products')
const addressRouter = require('./routes/addresses')
const ordersRouter = require('./routes/orders');

const app = express();

app.use('/uploads', express.static('uploads'));
app.use(bodyParser.json());
app.use(cors());

app.use('/users', userRoutes);
app.use('/products', productRoutes);
app.use('/address', addressRouter)
app.use('/orders', ordersRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
