const express = require('express');
const router = express.Router();
const db = require('../db');
const {authenticateToken} = require("../middlewares/auth");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

router.post('/send-message', authenticateToken, async (req, res) => {
    const { message } = req.body;
    const userId = req.user.id;

    if (!userId || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Save the client's message in the ConsultantMessages table
        await db.query('INSERT INTO ConsultantMessages (user_id, message, is_client) VALUES (?, ?, ?)', [userId, message, true]);

        const [historyRows] = await db.query('SELECT * FROM ConsultantMessages WHERE user_id = ? ORDER BY timestamp ASC', [userId]);

        let responseMessage = '';
        const [productRows] = await db.query('SELECT * FROM Products');
        const [orderRows] = await db.query('SELECT * FROM Orders WHERE user_id = ? ORDER BY createdAt ASC', [userId])
        const productNames = productRows.map(row => `Product name: ${row.name}, Product price: ${row.price}`).join('; ');
        const orderHistory = orderRows.map(row => `Order ID: ${row.order_id}, Status: ${row.status}, Total price: ${row.total_price}, Was ordered at: ${row.createdAt}`).join('; ')

        // Format the conversation history
        const conversationHistory = historyRows.map(row => ({ role: row.is_client ? 'user' : 'assistant', content: row.message }));

        // Add the system message and the user's latest message
        conversationHistory.unshift({ role: "system", content: "You are an online assistant in an online store of electronics" });
        conversationHistory.unshift({ role: "system", content: "You should answer only in 3-4 sentences" });
        conversationHistory.unshift({ role: "system", content: "You are working for online store, name of which is Devik.by" });
        conversationHistory.unshift({ role: "system", content: "Creator of online store is Ikromjon Akhmadjonov" });
        conversationHistory.unshift({ role: "system", content: "If user will ask info about this store, u can give him information" });
        conversationHistory.unshift({ role: "system", content: `Available products in store are: ${productNames}. Make sure to give information or advise about products depending on list of available products. There is also price of every product in BYN. If there isn't some product in this list, don't advise customer, just say that we don't have one. You can shortener name of products, because name of current products are too long.` });
        conversationHistory.unshift({ role: "system", content: `The user's order details are: ${orderHistory}` });
        conversationHistory.unshift({ role: "system", content: `If u can't handle user's request, or u really don't know what to answer, then recommend user to call to call center in order to get the answer. But firstly, always try to solve problem by yourself` });
        conversationHistory.push({ role: "user", content: message });

        const chatGPTConsultantResponse = await openai.createChatCompletion({
            model: 'gpt-4',
            messages: conversationHistory,
            max_tokens: 300,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        responseMessage = chatGPTConsultantResponse.data.choices[0].message.content.trim();

        await db.query('INSERT INTO ConsultantMessages (user_id, message, is_client) VALUES (?, ?, ?)', [userId, responseMessage, false]);

        // Fetch the entire conversation for the user
        const [conversationRows] = await db.query('SELECT * FROM ConsultantMessages WHERE user_id = ? ORDER BY timestamp ASC', [userId]);

        res.status(200).json({ conversation: conversationRows });

    } catch (err) {
        if (err.response && err.response.data) {
            console.error('ChatGPT API error:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Error:', err);
        }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
