const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
// Replace node-fetch require with dynamic import workaround for CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const upload = multer();
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Global error handler for Multer and other errors
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({
      error: 'File upload error',
      message: err.message,
      hint: 'Make sure you are sending a form-data request with a file field named "pdf".'
    });
  }
  if (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
  next();
});

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://models.github.ai/inference",
});

const conversations = new Map();

// Store PDF buffers by sessionId
const sessions = new Map();

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
    sessions.set(sessionId, req.file.buffer); // Store PDF buffer for citation generation

    res.json({ sessionId, reply: chatResponse.choices[0].message.content });
  } catch (err) {
    console.error('Error details:', err);
    res.status(500).send("Error processing PDF: " + err.message);
  }
});

// --- SMART CITATION GENERATOR ---
app.post('/api/generate-citations', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).send("Missing sessionId.");
    const pdfBuffer = sessions.get(sessionId);
    if (!pdfBuffer) return res.status(404).send("Session not found or PDF not available.");

    // 1. Extract text from PDF
    const data = await pdfParse(pdfBuffer);
    const text = data.text.slice(0, 12000);

    // 2. Use GPT to extract citation-worthy statements (refined prompt)
    const extractPrompt = `From the following text, extract up to 10 statements that would require a citation in an academic paper. Only include factual claims, statistics, research findings, or historical events. Do NOT include code, formatting, or non-informational lines. Do NOT include lines that are just brackets, code blocks, or JSON. Return only the statements as a JSON array of strings.\n\n${text}`;
    const extractRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an academic writing assistant." },
        { role: "user", content: extractPrompt }
      ],
      temperature: 0.7,
    });
    let statements = [];
    try {
      statements = JSON.parse(extractRes.choices[0].message.content);
    } catch (e) {
      // fallback: try to extract lines
      statements = extractRes.choices[0].message.content.split(/\n|\r/).filter(s => s.trim().length > 0);
    }
    // Post-process: filter out code, brackets, and short/irrelevant lines
    statements = statements.filter(s => {
      const trimmed = s.trim();
      if (trimmed.length < 20) return false; // too short
      if (/^\[.*\]$/.test(trimmed)) return false; // just brackets
      if (/^```/.test(trimmed)) return false; // code block
      if (/^\{.*\}$/.test(trimmed)) return false; // just curly braces
      if (/json|code|function|let |const |var |=>|<|>/.test(trimmed)) return false; // code-like
      return true;
    }).slice(0, 10);

    // 3. For each statement, search the web and get top result using SerpAPI
    const serpApiKey = process.env.SERPAPI_KEY;
    if (!serpApiKey) return res.status(500).send("SerpAPI key not set.");
    const results = [];
    for (const statement of statements) {
      // SerpAPI Google Search
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(statement)}&hl=en&gl=us&api_key=${serpApiKey}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      const organicResults = serpData.organic_results || [];
      if (organicResults.length === 0) {
        results.push({ statement, source: null, citation: "No credible source found." });
        continue;
      }
      const best = organicResults[0];
      // 4. Use GPT to format citation in APA style
      const citationPrompt = `Generate an APA citation for the following source.\nTitle: \"${best.title || ''}\"\nURL: \"${best.link || ''}\"\nPublisher: \"${best.source || ''}\"\nDate Accessed: ${new Date().toISOString().slice(0,10)}`;
      const citationRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a citation formatting assistant." },
          { role: "user", content: citationPrompt }
        ],
        temperature: 0.2,
      });
      const citation = citationRes.choices[0].message.content.trim();
      results.push({ statement, source: best.link, citation });
    }
    res.json(results);
  } catch (err) {
    console.error('Smart citation error:', err);
    res.status(500).send("Error generating citations: " + err.message);
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
