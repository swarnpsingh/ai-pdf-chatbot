import OpenAI from 'openai';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// In-memory maps (limited persistence)
const conversations = new Map();
const sessions = new Map();

const model = "meta/Llama-4-Maverick-17B-128E-Instruct-FP8";
const endpoint = "https://models.github.ai/inference";

export default {
	async fetch(request, env, ctx) {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const { pathname } = new URL(request.url);

		if (pathname === '/api/upload' && request.method === 'POST') {
			return handleUpload(request, env);
		}

		if (pathname === '/api/followup' && request.method === 'POST') {
			return handleFollowup(request, env);
		}

		if (pathname === '/api/generate-citations' && request.method === 'POST') {
			return handleCitations(request, env);
		}

		// Always include CORS headers on 404
		return new Response('Not found', { status: 404, headers: corsHeaders });
	},
};

// ------------- 📄 /api/upload -------------
async function handleUpload(request, env) {
	try {
		const body = await request.json(); // Accept JSON with base64/text content
		const { extractedText } = body;

		if (!extractedText || extractedText.length < 20) {
			return new Response('Extracted text is empty or too short.', { status: 400, headers: corsHeaders });
		}

		const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: endpoint });

		const sessionId = crypto.randomUUID();
		const conversation = [
			{ role: 'system', content: "You're a helpful assistant that summarizes PDFs in one paragraph." },
			{ role: 'user', content: `Here's the text:\n\n${extractedText}` },
			{ role: 'user', content: 'Summarize this document.' },
		];

		const res = await openai.chat.completions.create({
			model: model,
			messages: conversation,
			temperature: 1.2,
		});

		const reply = res.choices[0].message.content;
		conversation.push({ role: 'assistant', content: reply });
		conversations.set(sessionId, conversation);
		sessions.set(sessionId, extractedText);

		return new Response(JSON.stringify({ sessionId, reply }), { headers: corsHeaders });
	} catch (err) {
	console.error("Upload Error", err);
	return new Response(
		'Upload Error: ' + err.message + '\n' + (err.stack || ''),
		{ status: 500, headers: corsHeaders }
	);
}

}

// ------------- 📄 /api/followup -------------
async function handleFollowup(request, env) {
	try {
		const body = await request.json();
		const { sessionId, message } = body;

		if (!sessionId || !message) {
			return new Response('Missing sessionId or message', { status: 400, headers: corsHeaders });
		}

		const convo = conversations.get(sessionId);
		if (!convo) {
			return new Response('Session not found', { status: 404, headers: corsHeaders });
		}

		convo.push({ role: 'user', content: message });
		convo.push({ role: 'user', content: 'Please answer in 2-3 lines maximum.' });

		const openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY,
			baseURL: endpoint,
		});

		const res = await openai.chat.completions.create({
			model: model,
			messages: convo,
			temperature: 1.2,
		});

		const reply = res.choices[0].message.content;
		convo.push({ role: 'assistant', content: reply });

		return new Response(JSON.stringify({ reply }), { headers: corsHeaders });
	} catch (err) {
		return new Response('Follow-up Error: ' + err.message, { status: 500, headers: corsHeaders });
	}
}

// ------------- 📄 /api/followup -------------
async function handleCitations(request, env) {
	try {
		const { sessionId } = await request.json();

		if (!sessionId) {
			return new Response('Missing sessionId.', { status: 400, headers: corsHeaders });
		}

		const pdfBuffer = sessions.get(sessionId);
		if (!pdfBuffer) {
			return new Response('Session not found or PDF not available.', { status: 404, headers: corsHeaders });
		}

		// You need a PDF parsing utility — for now we mock extracted text
		const extractedText = '[PDF text extraction not implemented in Worker]';

		const extractPrompt = `From the following text, extract up to 10 statements that would require a citation in an academic paper. Only include factual claims, statistics, research findings, or historical events. Do NOT include code, formatting, or non-informational lines. Return only the statements as a JSON array of strings.\n\n${extractedText}`;

		const openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY,
			baseURL: endpoint,
		});

		const extractRes = await openai.chat.completions.create({
			model: model,
			messages: [
				{ role: 'system', content: 'You are an academic writing assistant.' },
				{ role: 'user', content: extractPrompt },
			],
			temperature: 0.7,
		});

		let statements = [];
		try {
			statements = JSON.parse(extractRes.choices[0].message.content);
		} catch (e) {
			statements = extractRes.choices[0].message.content.split(/\n|\r/).filter((s) => s.trim().length > 0);
		}

		statements = statements
			.filter((s) => {
				const trimmed = s.trim();
				if (trimmed.length < 20) return false;
				if (/^\[.*\]$/.test(trimmed)) return false;
				if (/^```/.test(trimmed)) return false;
				if (/^\{.*\}$/.test(trimmed)) return false;
				if (/json|code|function|let |const |var |=>|<|>/.test(trimmed)) return false;
				return true;
			})
			.slice(0, 10);

		const serpApiKey = env.SERPAPI_KEY;
		if (!serpApiKey) {
			return new Response('SerpAPI key not set.', { status: 500, headers: corsHeaders });
		}

		const results = [];
		for (const statement of statements) {
			const url = `https://serpapi.com/search.json?q=${encodeURIComponent(statement)}&hl=en&gl=us&api_key=${serpApiKey}`;
			const serpRes = await fetch(url);
			const serpData = await serpRes.json();
			const best = (serpData.organic_results || [])[0];

			if (!best) {
				results.push({ statement, source: null, citation: 'No credible source found.' });
				continue;
			}

			const citationPrompt = `Generate an APA citation for the following source.\nTitle: "${best.title || ''}"\nURL: "${
				best.link || ''
			}"\nPublisher: "${best.source || ''}"\nDate Accessed: ${new Date().toISOString().slice(0, 10)}`;

			const citationRes = await openai.chat.completions.create({
				model: 'gpt-4o',
				messages: [
					{ role: 'system', content: 'You are a citation formatting assistant.' },
					{ role: 'user', content: citationPrompt },
				],
				temperature: 0.2,
			});

			const citation = citationRes.choices[0].message.content.trim();
			results.push({ statement, source: best.link, citation });
		}

		return new Response(JSON.stringify(results), { headers: corsHeaders });
	} catch (err) {
		return new Response('Citation generation error: ' + err.message, { status: 500, headers: corsHeaders });
	}
}
