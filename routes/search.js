const express = require('express');
const router = express.Router();
const db = require('../db');
const {authenticateToken} = require("../middlewares/auth");
const { Configuration, OpenAIApi } = require("openai");
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });
const Fuse = require('fuse.js');

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

function truncateString(str, length) {
    if (str.length > length) {
        return str.substring(0, length) + "...";
    } else {
        return str;
    }
}

router.post("/", authenticateToken, async (req, res) => {
    const {query} = req.body
    const userId = req.user.id

    if (!userId || !query) {
        return res.status(400).json({error: "Missing required fields"})
    }

    let responseMessage;
    try {
        let productRows = myCache.get("products");

        if (!productRows) {
            const [rows] = await db.query('SELECT * FROM Products');
            productRows = rows;
            myCache.set("products", productRows);
        }

        const productList = productRows.map(row => `Product name: ${row.name}, Product description: ${row.description}, Product id: ${row.id};`)

        const chatGPTConsultantResponse = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: "system", content: `Available product list: ${productList}`
                },
                {
                    role: "system",
                    content: "You are a search engine in online store of electronics. You have a list of products, and you will receive queries from users, and you should return in this scheme (DATA ONLY): '{product name}, {products id};', which user asked for"
                },
                {
                    role: "user",
                    content: query
                }
            ],
            max_tokens: 300,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        responseMessage = chatGPTConsultantResponse.data.choices[0].message.content.trim();

        const tokensUsed = chatGPTConsultantResponse.data.usage.total_tokens;

        await db.query('INSERT INTO GPT4Log (user_id, request_message, response_message, tokens_used) VALUES (?, ?, ?, ?)', [userId, query, responseMessage, tokensUsed]);

        const storedRes = responseMessage.split(";").map(product => {
            const splitItem = product.split(",")
            return {
                product_id: splitItem[1],
                product_name: truncateString(splitItem[0], 50)
            }
        })
        console.log(responseMessage.split(";"))
        storedRes.splice(-1)

        res.status(200).json({result: storedRes})
    } catch (e) {
        return res.status(500).json({error: "Internal server error"})
    }
})

router.post("/v2", authenticateToken, async (req, res) => {
    const {query} = req.body
    const userId = req.user.id

    const options = {
        keys: ['name', 'description'], // Search keys to match against
        threshold: 0.6, // Adjust the matching threshold as needed
    };

    if (!query || !userId) {
        return res.status(400).json({error: "Missing requested fields"})
    }

    try {
        let productRows = myCache.get("products");

        if (!productRows) {
            const [rows] = await db.query('SELECT * FROM Products');
            productRows = rows;
            myCache.set("products", productRows);
        }

        const productList = productRows.map(row => {
            return {
                id: row.id,
                name: row.name,
                description: row.description
            }
        })

        const fuse = new Fuse(productList, options); // Create the fuzzy search instance
        const searchResults = fuse.search(query); // Perform the fuzzy search with the search query

        return res.status(200).json({result: searchResults})

    } catch (e) {
        return res.status(500).json({error: "Internal server error"})
    }

})

module.exports = router
