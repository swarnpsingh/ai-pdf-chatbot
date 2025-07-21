const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const upload = multer();
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://models.github.ai/inference",
});

const conversations = new Map();

// ----------------------------
// 📄 Upload and Summarize PDF
// ----------------------------
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded. Make sure the form field is named 'pdf'.");
    }
    const data = await pdfParse(req.file.buffer);
    const extractedText = data.text.slice(0, 12000); // truncate if needed

    const sessionId = uuidv4();

    const conversation = [
      { role: "system", content: "You're a helpful assistant that reads PDFs and generates one paragraph summary. You don't use *." },
      { role: "user", content: `Here’s the text from the PDF:\n\n${extractedText}` },
      { role: "user", content: "Summarize this document." }
    ];

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: conversation,
      temperature: 1.2,
    });

    conversation.push({
      role: "assistant",
      content: chatResponse.choices[0].message.content
    });

    conversations.set(sessionId, conversation);

    res.json({ sessionId, reply: chatResponse.choices[0].message.content });
  } catch (err) {
    console.error('Error details:', err);
    res.status(500).send("Error processing PDF: " + err.message);
  }
});

// ----------------------------
// 🔁 Follow-up Conversation
// ----------------------------
app.post('/api/followup', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).send("Missing sessionId or message.");
    }

    const convo = conversations.get(sessionId);
    if (!convo) {
      return res.status(404).send("Session not found.");
    }

    convo.push({ role: "user", content: message });
    convo.push({ role: "user", content: "Please answer in 2-3 lines maximum." });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: convo,
      temperature: 1.2,
    });

    convo.push({ role: "assistant", content: response.choices[0].message.content });

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error handling follow-up.");
  }
});

// ----------------------------
// 🚀 Start Server
// ----------------------------
app.listen(4000, () => console.log('Server running on http://localhost:4000'));
