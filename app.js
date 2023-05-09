const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const {Server} = require('socket.io');
const db = require("./db")

const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products')
const addressRouter = require('./routes/addresses')
const ordersRouter = require('./routes/orders');
const consultant = require("./routes/consultant")

const app = express();

const server = http.createServer(app);
const io = new Server(server);
app.use('/uploads', express.static('uploads'));
app.use(bodyParser.json());
app.use(cors());

app.use('/users', userRoutes);
app.use('/products', productRoutes);
app.use('/address', addressRouter)
app.use('/orders', ordersRouter);
app.use("/consultant", consultant)

// Set up the Socket.IO server
io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    socket.on('get_conversation', async (userId) => {
        try {
            const [conversationRows] = await db.query('SELECT * FROM ConsultantMessages WHERE user_id = ? ORDER BY timestamp ASC', [userId]);
            socket.emit('conversation_history', conversationRows);
        } catch (err) {
            console.error(err);
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
