const express = require('express');
const router = express.Router();
const db = require('../db');
const {authenticateToken} = require("../middlewares/auth");
const { Configuration, OpenAIApi } = require("openai");
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

router.post('/new-conversation', authenticateToken, async (req, res) => {
    const userId = req.user.id

    if (!userId) {
        return res.status(400).json({error: "Mission required fields"})
    }

    try {
        const result = await db.query('INSERT INTO Conversations (user_id) VALUES (?)', [userId])
        const conversationId = result[0].insertId;
        return res.status(200).json({ conversationId: conversationId });

    } catch (e) {
        return res.status(500).json({error: "Internal server error"})
    }
})

router.get("/last-conversation-id", authenticateToken, async (req, res) => {
    const userId = req.user.id
    if (!userId) {
        return res.status(400).json({error: "Missing required fields"})
    }

    try {
        const [conversationRows] = await db.query('SELECT * FROM Conversations ORDER BY id DESC LIMIT 1');
        const lastConversationId = conversationRows[0].id;

        return res.status(200).json({conversationId: lastConversationId})
    } catch (e) {
        return res.status(500).json({error: "Internal server error"})
    }
})

router.post('/send-message', authenticateToken, async (req, res) => {
    const { message, conversation_id } = req.body;
    const userId = req.user.id;

    if (!userId || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {

        const testChatGPTRes = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: `Message: ${message}. Is this message about user order? Answer simply 'Yes' or 'No' ONLY`,
            max_tokens: 300,
            n: 1,
            stop: null,
            temperature: 0.5,
        })

        const totalToken = testChatGPTRes.data.usage.total_tokens
        const completion_tokens = testChatGPTRes.data.usage.completion_tokens
        const prompt_tokens = testChatGPTRes.data.usage.prompt_tokens
        await db.query('INSERT INTO GPT4Log (user_id, request_message, response_message, tokens_used, conversation_id, prompt_token, completion_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, message, "ORDER", totalToken, conversation_id, prompt_tokens, completion_tokens]);

        const firstRowTest = testChatGPTRes.data.choices[0].text.replace(/\s/g, "")

        // Save the client's message in the ConsultantMessages table
        await db.query('INSERT INTO ConsultantMessages (user_id, message, is_client, conversation_id) VALUES (?, ?, ?, ?)', [userId, message, true, conversation_id]);

        if (firstRowTest.toLowerCase() === "yes") {
            await db.query('INSERT INTO ConsultantMessages (user_id, message, is_client, conversation_id) VALUES (?, ?, ?, ?)', [userId, "ORDER", false, conversation_id]);

            // Fetch the entire conversation for the user
            const [conversationRows] = await db.query('SELECT * FROM ConsultantMessages WHERE conversation_id = ? ORDER BY timestamp ASC', [conversation_id]);
            res.status(200).json({ conversation: conversationRows });
        } else {
            const [historyRows] = await db.query('SELECT * FROM ConsultantMessages WHERE conversation_id = ? ORDER BY timestamp ASC', [conversation_id]);

            let responseMessage = '';
            let productRows = myCache.get("products");

            if (!productRows) {
                const [rows] = await db.query('SELECT * FROM Products');
                productRows = rows;
                myCache.set("products", productRows);
            }
            let orderRows = myCache.get("orders")
            if (!orderRows) {
                const [rows] = await db.query('SELECT * FROM Orders WHERE user_id = ? ORDER BY createdAt ASC', [userId])
                orderRows = rows
                myCache.set("orders", orderRows)
            }
            // const productNames = productRows.map(row => `Product name: ${row.name}, Product price: ${row.price}`).join('; ');
            // const orderHistory = orderRows.map(row => `Order ID: ${row.order_id}, Status: ${row.status}, Total price: ${row.total_price}, Was ordered at: ${row.createdAt}`).join('; ')

            // Format the conversation history
            const conversationHistory = historyRows.map(row => ({ role: row.is_client ? 'user' : 'assistant', content: row.message }));

            // Add the system message and the user's latest message
            conversationHistory.unshift({ role: "system", content: "You are an online assistant in an online store of electronics, name of which is Devik.by. Creator of online store is Ikromjon Akhmadjonov" });
            conversationHistory.unshift({ role: "system", content: "You should answer only in 3-4 sentences" });
            // conversationHistory.unshift({ role: "system", content: `Available products in store are: ${productNames}. Make sure to give information or advise about products depending on list of available products. There is also price of every product in BYN. If there isn't some product in this list, don't advise customer, just say that we don't have one. You can shortener name of products, because name of current products are too long.` });
            // conversationHistory.unshift({ role: "system", content: `The user's order details are: ${orderHistory}` });
            conversationHistory.unshift({ role: "system", content: `If user ask for help to choose something, advise, but also explain user, that this information could be inaccurate` });
            conversationHistory.unshift({ role: "system", content: `If u can't handle user's request, or u really don't know what to answer, then recommend user to call to call center in order to get the answer. But firstly, always try to solve problem by yourself` });
            conversationHistory.push({ role: "user", content: message });

            const chatGPTConsultantResponse = await openai.createChatCompletion({
                model: 'gpt-3.5-turbo',
                messages: conversationHistory,
                max_tokens: 300,
                n: 1,
                stop: null,
                temperature: 0.5,
            });

            responseMessage = chatGPTConsultantResponse.data.choices[0].message.content.trim();
            const totalToken = chatGPTConsultantResponse.data.usage.total_tokens
            const completion_tokens = chatGPTConsultantResponse.data.usage.completion_tokens
            const prompt_tokens = chatGPTConsultantResponse.data.usage.prompt_tokens

            await db.query('INSERT INTO GPT4Log (user_id, request_message, response_message, tokens_used, conversation_id, prompt_token, completion_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, message, responseMessage, totalToken, conversation_id, prompt_tokens, completion_tokens]);

            await db.query('INSERT INTO ConsultantMessages (user_id, message, is_client, conversation_id) VALUES (?, ?, ?, ?)', [userId, responseMessage, false, conversation_id]);

            // Fetch the entire conversation for the user
            const [conversationRows] = await db.query('SELECT * FROM ConsultantMessages WHERE conversation_id = ? ORDER BY timestamp ASC', [conversation_id]);
            res.status(200).json({ conversation: conversationRows });
        }
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
