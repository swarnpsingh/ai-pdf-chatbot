import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
// import pdfParse from 'pdf-parse/browser';
import { PDFDocument } from 'pdf-lib';
import { serve } from '@hono/node-server';

const app = new Hono();

// In-memory maps (not persistent in Workers)
const conversations = new Map();
const sessions = new Map();

const getEnv = (c, key) => c.env[key];

// ----------------------------
// 📄 Upload and Summarize PDF
// ----------------------------
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('pdf');
    if (!file) {
      return c.text("No file uploaded. Make sure the form field is named 'pdf'.", 400);
    }
    const buffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(buffer);
    let extractedText = '';
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      extractedText += page.getTextContent ? await page.getTextContent() : '';
    }
    extractedText = extractedText.slice(0, 12000);

    // ...rest of your code...
  } catch (err) {
    return c.text("Error processing PDF: " + err.message, 500);
  }
});

// --- SMART CITATION GENERATOR ---
app.post('/api/generate-citations', async (c) => {
  try {
    const { sessionId } = await c.req.json();
    if (!sessionId) return c.text("Missing sessionId.", 400);
    const pdfBuffer = sessions.get(sessionId);
    if (!pdfBuffer) return c.text("Session not found or PDF not available.", 404);

    const data = await pdfParse(pdfBuffer);
    const text = data.text.slice(0, 12000);

    const extractPrompt = `From the following text, extract up to 10 statements that would require a citation in an academic paper. Only include factual claims, statistics, research findings, or historical events. Do NOT include code, formatting, or non-informational lines. Do NOT include lines that are just brackets, code blocks, or JSON. Return only the statements as a JSON array of strings.\n\n${text}`;
    const openai = new OpenAI({
      apiKey: getEnv(c, 'OPENAI_API_KEY'),
      baseURL: "https://models.github.ai/inference",
    });
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
      statements = extractRes.choices[0].message.content.split(/\n|\r/).filter(s => s.trim().length > 0);
    }
    statements = statements.filter(s => {
      const trimmed = s.trim();
      if (trimmed.length < 20) return false;
      if (/^\[.*\]$/.test(trimmed)) return false;
      if (/^```/.test(trimmed)) return false;
      if (/^\{.*\}$/.test(trimmed)) return false;
      if (/json|code|function|let |const |var |=>|<|>/.test(trimmed)) return false;
      return true;
    }).slice(0, 10);

    const serpApiKey = getEnv(c, 'SERPAPI_KEY');
    if (!serpApiKey) return c.text("SerpAPI key not set.", 500);
    const results = [];
    for (const statement of statements) {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(statement)}&hl=en&gl=us&api_key=${serpApiKey}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      const organicResults = serpData.organic_results || [];
      if (organicResults.length === 0) {
        results.push({ statement, source: null, citation: "No credible source found." });
        continue;
      }
      const best = organicResults[0];
      const citationPrompt = `Generate an APA citation for the following source.\nTitle: "${best.title || ''}"\nURL: "${best.link || ''}"\nPublisher: "${best.source || ''}"\nDate Accessed: ${new Date().toISOString().slice(0,10)}`;
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
    return c.json(results);
  } catch (err) {
    return c.text("Error generating citations: " + err.message, 500);
  }
});

// ----------------------------
// 🔁 Follow-up Conversation
// ----------------------------
app.post('/api/followup', async (c) => {
  try {
    const { sessionId, message } = await c.req.json();
    if (!sessionId || !message) {
      return c.text("Missing sessionId or message.", 400);
    }
    const convo = conversations.get(sessionId);
    if (!convo) {
      return c.text("Session not found.", 404);
    }
    convo.push({ role: "user", content: message });
    convo.push({ role: "user", content: "Please answer in 2-3 lines maximum." });

    const openai = new OpenAI({
      apiKey: getEnv(c, 'OPENAI_API_KEY'),
      baseURL: "https://models.github.ai/inference",
    });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: convo,
      temperature: 1.2,
    });

    convo.push({ role: "assistant", content: response.choices[0].message.content });

    return c.json({ reply: response.choices[0].message.content });
  } catch (err) {
    return c.text("Error handling follow-up: " + err.message, 500);
  }
});

serve(app);

export default app;