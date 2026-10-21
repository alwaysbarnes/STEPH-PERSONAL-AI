import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(__dirname));

// Ensure data directory exists for server-side persistence
// (Skipped on Vercel where filesystem is read-only; localStorage handles persistence instead)
const DATA_DIR = path.join(__dirname, 'data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify([], null, 2));
  }
} catch (e) {
  // Read-only filesystem (e.g. Vercel) — conversations will use browser localStorage
}

// System Persona for STEPH
const STEPH_SYSTEM_PROMPT = `You are STEPH, an elite personal AI assistant with a warm, intelligent, witty, and confident Ghanaian personality.
You are respectful, proactive, highly knowledgeable, and articulate, carrying a natural Ghanaian charisma and hospitable spirit ("Akwaaba").

LANGUAGE CAPABILITIES:
1. English: Fluent, sharp, professional, elegant, and modern.
2. Twi (Akan): Native-level fluency in conversational and formal Twi (Asante Twi / Akuapem Twi). You understand traditional idioms, proverbs, and greetings (e.g., "Akwaaba", "Ɛte sɛn?", "Me ho yɛ", "Medaase pii", "Yɛbɛka ho asɛm", "Nyame nhyira wo").
3. Ghanaian Pidgin: Authentic, vibrant, culturally natural Ghanaian Pidgin (e.g., "Chale", "How body?", "Wetin dey happen?", "No wahala at all", "I dey for you", "Make we do am sharp", "Everything dey bee", "You barb?").
4. Code-Switching (Mixed Languages): You effortlessly understand and engage in Ghanaian code-switching (English + Twi, English + Ghanaian Pidgin).
5. Dynamic Language Matching: You ALWAYS match the primary language or mix that the user is currently communicating in, while allowing the user to switch languages at any moment. When the user asks in Twi, reply naturally in Twi. When the user speaks Pidgin, reply in lively Ghanaian Pidgin. When in English, reply in polished English. When mixed, mirror their natural rhythm.

PERSONALITY & DEMEANOR:
- Warm, polite, confident, engaging, and witty without being goofy or unprofessional.
- Deeply knowledgeable across software engineering, science, business, writing, Ghanaian culture/history/geography, and global topics.
- Always provide direct, actionable, well-reasoned answers.
- Format code blocks with language identifiers (e.g., \`\`\`javascript, \`\`\`python, \`\`\`html).
- Format lists, math, and tables clearly using clean Markdown.
- Never claim to be a generic placeholder or mock chatbot. You are STEPH, a live, real personal AI assistant.`;

// Helper to get active API keys (from request header, body, or server .env)
function getProviderCredentials(req) {
  const customKey = req.headers['x-api-key'] || req.body.apiKey;
  const provider = (req.headers['x-ai-provider'] || req.body.provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const model = req.headers['x-ai-model'] || req.body.model;

  let apiKey = customKey;
  if (!apiKey) {
    if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
    else if (provider === 'groq') apiKey = process.env.GROQ_API_KEY;
    else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
    else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
    else if (provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY;
  }

  return { provider, apiKey, model };
}

// Check status endpoint
app.get('/api/status', (req, res) => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const defaultProvider = process.env.AI_PROVIDER || (hasGeminiKey ? 'gemini' : hasGroqKey ? 'groq' : hasOpenAIKey ? 'openai' : 'none');

  res.json({
    status: 'online',
    assistant: 'STEPH',
    version: '2.0.0',
    providers: {
      gemini: { available: hasGeminiKey, defaultModel: 'gemini-3.8-flash' },
      groq: { available: hasGroqKey, defaultModel: 'llama-3.3-70b-versatile' },
      openai: { available: hasOpenAIKey, defaultModel: 'gpt-4o-mini' },
      anthropic: { available: hasAnthropicKey, defaultModel: 'claude-3-5-sonnet-20241022' }
    },
    activeProvider: defaultProvider,
    isConfigured: hasGeminiKey || hasGroqKey || hasOpenAIKey || hasAnthropicKey
  });
});

// Save configuration endpoint (save keys to server .env safely)
app.post('/api/config', (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and apiKey are required' });
    }

    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    let keyVar = 'GEMINI_API_KEY';
    if (provider === 'groq') keyVar = 'GROQ_API_KEY';
    if (provider === 'openai') keyVar = 'OPENAI_API_KEY';
    if (provider === 'anthropic') keyVar = 'ANTHROPIC_API_KEY';
    if (provider === 'openrouter') keyVar = 'OPENROUTER_API_KEY';

    const regex = new RegExp(`^${keyVar}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${keyVar}=${apiKey.trim()}`);
    } else {
      envContent += `\n${keyVar}=${apiKey.trim()}\n`;
    }

    // Set active provider
    const provRegex = /^AI_PROVIDER=.*$/m;
    if (provRegex.test(envContent)) {
      envContent = envContent.replace(provRegex, `AI_PROVIDER=${provider}`);
    } else {
      envContent += `AI_PROVIDER=${provider}\n`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    process.env[keyVar] = apiKey.trim();
    process.env.AI_PROVIDER = provider;

    res.json({ success: true, message: `Configured ${provider} successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update configuration: ' + err.message });
  }
});

// Conversations persistence endpoints
app.get('/api/conversations', (req, res) => {
  try {
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    res.json(JSON.parse(data || '[]'));
  } catch (err) {
    res.status(500).json({ error: 'Error reading conversations' });
  }
});

app.post('/api/conversations', (req, res) => {
  try {
    const conversations = req.body;
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving conversations' });
  }
});

// Helper to normalize Gemini model names
function normalizeGeminiModel(m) {
  if (!m || typeof m !== 'string') return 'gemini-3.8-flash';
  const trimmed = m.trim();
  if (trimmed === 'gemini-2.0-flash' || trimmed === 'gemini-1.5-flash' || trimmed.includes('2.0') || trimmed.includes('1.5')) {
    return 'gemini-3.8-flash';
  }
  return trimmed;
}

// Format and sanitize history for Gemini generateContent / streamGenerateContent
function sanitizeGeminiContents(messages, attachments) {
  const contents = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    // Attachments on the latest user message
    if (i === messages.length - 1 && attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.mimeType && att.mimeType.startsWith('image/') && att.base64) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64.replace(/^data:image\/\w+;base64,/, '')
            }
          });
        } else if (att.text) {
          parts.push({
            text: `[Attached File: ${att.name}]\n${att.text}\n`
          });
        }
      }
    }

    const textContent = (msg.content || '').trim();
    if (textContent) {
      parts.push({ text: textContent });
    }

    // Skip empty messages (Gemini API rejects empty parts)
    if (parts.length === 0) continue;

    // Merge consecutive messages with the same role (Gemini requires strictly alternating roles)
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  // Ensure first message has role 'user'
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  // Fallback if conversation is empty
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello STEPH' }] });
  }

  return contents;
}

// Dedicated connection test endpoint
app.post('/api/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, model } = getProviderCredentials(req);
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: `No API key found for ${provider.toUpperCase()}. Please configure your API key in Settings or in the .env file.`
      });
    }

    if (provider === 'gemini') {
      const activeModel = normalizeGeminiModel(model);
      const isOAuth = apiKey.startsWith('ya29.');
      const testUrl = isOAuth
        ? `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      };
      if (isOAuth) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      let response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with: "STEPH is connected and ready."' }] }]
        })
      });

      // Model fallback if 404 or 400
      if (!response.ok && (response.status === 404 || response.status === 400)) {
        const fallbacks = ['gemini-3.8-flash', 'gemini-2.5-flash'].filter(m => m !== activeModel);
        for (const fb of fallbacks) {
          const fbUrl = isOAuth
            ? `https://generativelanguage.googleapis.com/v1beta/models/${fb}:generateContent`
            : `https://generativelanguage.googleapis.com/v1beta/models/${fb}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const fbRes = await fetch(fbUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
            })
          });
          if (fbRes.ok) {
            response = fbRes;
            break;
          }
        }
      }

      const resData = await response.json();
      if (!response.ok) {
        const msg = resData.error?.message || `Gemini API responded with status ${response.status}`;
        return res.status(response.status).json({ success: false, error: msg });
      }

      const text = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'STEPH is connected!';
      return res.json({ success: true, model: activeModel, reply: text });
    }

    return res.json({ success: true, message: `${provider.toUpperCase()} credentials validated.` });
  } catch (err) {
    console.error('Test connection error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// REAL STREAMING AI ENDPOINT
app.post('/api/chat', async (req, res) => {
  const { messages, attachments, languageMode } = req.body;
  const { provider, apiKey, model } = getProviderCredentials(req);

  if (!apiKey) {
    return res.status(401).json({
      error: `No API key found for ${provider.toUpperCase()}. Please configure your API key in Settings (gear icon in the top right) or add it to the .env file.`
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send SSE event helper
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Inject language guidance if set by user
    let effectiveSystemPrompt = STEPH_SYSTEM_PROMPT;
    if (languageMode === 'twi') {
      effectiveSystemPrompt += '\n\nIMPORTANT: The user has selected TWI language mode. Reply strictly in fluent, natural Akan/Twi unless explicitly instructed otherwise.';
    } else if (languageMode === 'pidgin') {
      effectiveSystemPrompt += '\n\nIMPORTANT: The user has selected GHANAIAN PIDGIN mode. Reply strictly in rich, authentic Ghanaian Pidgin.';
    } else if (languageMode === 'english') {
      effectiveSystemPrompt += '\n\nIMPORTANT: The user has selected ENGLISH mode. Reply in clear, sophisticated English.';
    }

    if (provider === 'gemini') {
      const activeModel = normalizeGeminiModel(model);
      await streamGemini(apiKey, activeModel, effectiveSystemPrompt, messages, attachments, sendEvent);
    } else if (provider === 'groq') {
      await streamOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', apiKey, model || 'llama-3.3-70b-versatile', effectiveSystemPrompt, messages, attachments, sendEvent);
    } else if (provider === 'openai') {
      await streamOpenAICompatible('https://api.openai.com/v1/chat/completions', apiKey, model || 'gpt-4o-mini', effectiveSystemPrompt, messages, attachments, sendEvent);
    } else if (provider === 'anthropic') {
      await streamAnthropic(apiKey, model || 'claude-3-5-sonnet-20241022', effectiveSystemPrompt, messages, attachments, sendEvent);
    } else if (provider === 'openrouter') {
      await streamOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', apiKey, model || 'google/gemini-2.0-flash-exp:free', effectiveSystemPrompt, messages, attachments, sendEvent);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    sendEvent('done', { done: true });
    res.end();
  } catch (error) {
    console.error('AI Generation Error:', error);
    sendEvent('error', {
      error: error.message || 'An error occurred while generating STEPH\'s response.'
    });
    res.end();
  }
});

// Stream Google Gemini API
async function streamGemini(apiKey, rawModelName, systemPrompt, messages, attachments, sendEvent) {
  const modelName = normalizeGeminiModel(rawModelName);
  const contents = sanitizeGeminiContents(messages, attachments);

  const isOAuth = apiKey.startsWith('ya29.');
  const getEndpoint = (m) => isOAuth
    ? `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };
  if (isOAuth) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let response = await fetch(getEndpoint(modelName), {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  // Resilient fallback if specific model variant is not available
  if (!response.ok && (response.status === 404 || response.status === 400)) {
    const fallbackModels = ['gemini-3.8-flash', 'gemini-2.5-flash'].filter(m => m !== modelName);
    for (const fbModel of fallbackModels) {
      console.log(`Model ${modelName} returned status ${response.status}. Retrying with ${fbModel}...`);
      const fbResponse = await fetch(getEndpoint(fbModel), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (fbResponse.ok) {
        response = fbResponse;
        break;
      }
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errText); } catch (e) {}
    const msg = parsed?.error?.message || errText || `Gemini API returned status ${response.status}`;
    throw new Error(`Gemini Error: ${msg}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let tokenCount = 0;

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') return;

    try {
      const data = JSON.parse(jsonStr);
      if (data.promptFeedback?.blockReason) {
        sendEvent('error', { error: `Gemini Content Filter: response blocked (${data.promptFeedback.blockReason})` });
        return;
      }
      const candidates = data.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.text) {
            tokenCount++;
            sendEvent('token', { text: part.text });
          }
        }
      }
    } catch (err) {
      // Partial JSON chunk
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete line

    for (const line of lines) {
      processLine(line);
    }
  }

  // Process any leftover in buffer
  if (buffer.trim()) {
    processLine(buffer);
  }

  if (tokenCount === 0) {
    console.warn('Gemini stream completed with 0 tokens.');
  }
}

// Stream OpenAI / Groq / OpenRouter Compatible APIs
async function streamOpenAICompatible(url, apiKey, modelName, systemPrompt, messages, attachments, sendEvent) {
  const formattedMessages = [{ role: 'system', content: systemPrompt }];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i === messages.length - 1 && attachments && attachments.length > 0) {
      let contentWithFiles = msg.content || '';
      for (const att of attachments) {
        if (att.text) {
          contentWithFiles += `\n\n[Attached File: ${att.name}]\n\`\`\`\n${att.text}\n\`\`\``;
        }
      }
      formattedMessages.push({ role: msg.role, content: contentWithFiles });
    } else {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: formattedMessages,
      stream: true,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errText); } catch (e) {}
    const msg = parsed?.error?.message || errText || `API error ${response.status}`;
    throw new Error(`${msg}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') return;

      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          sendEvent('token', { text: delta });
        }
      } catch (e) {
        // partial json
      }
    }
  }
}

// Stream Anthropic Claude
async function streamAnthropic(apiKey, modelName, systemPrompt, messages, attachments, sendEvent) {
  const formattedMessages = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let content = msg.content || '';
    if (i === messages.length - 1 && attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.text) {
          content += `\n\n[Attached File: ${att.name}]\n${att.text}`;
        }
      }
    }
    formattedMessages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content
    });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      system: systemPrompt,
      messages: formattedMessages,
      max_tokens: 4096,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic Error: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          sendEvent('token', { text: parsed.delta.text });
        }
      } catch (e) {}
    }
  }
}

// Start server in local dev mode
// In Vercel, the app is exported and routes are handled serverlessly
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`✨ STEPH AI Assistant server is running on http://localhost:${PORT}`);
    console.log(`🌍 Multilingual Ghanaian Intelligence: English • Twi (Akan) • Ghanaian Pidgin`);
  });
}

export default app;
