const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config/gemini');

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY || config.apiKey;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

// Token bucket: 14 req/min headroom under 15/min Gemini free-tier limit.
// NOTE: In-process state — assumes SINGLE process. PM2 cluster or multi-worker
// deployments must move this to a shared store (Redis counter) or set
// PM2 instances=1, else effective rate-limit is multiplied by worker count.
const REQUESTS_PER_MINUTE = 14;
let tokens = REQUESTS_PER_MINUTE;
let lastRefill = Date.now();
function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const refillAmount = (elapsed / 60_000) * REQUESTS_PER_MINUTE;
  tokens = Math.min(REQUESTS_PER_MINUTE, tokens + refillAmount);
  lastRefill = now;
}
async function takeToken() {
  refill();
  while (tokens < 1) {
    await new Promise((r) => setTimeout(r, 1000));
    refill();
  }
  tokens -= 1;
}

/**
 * Stream one model turn.
 *
 * Takes the FULL conversation as `contents` (or `history` + `userMessage` for
 * convenience) and calls generateContentStream instead of startChat: the chat
 * helper of this SDK assigns role 'function' to tool results, which current
 * Gemini models reject ("Role 'function' is not supported"), and it strips
 * thought signatures that Gemini 3 requires to be echoed back on tool turns.
 *
 * Returns { text, toolCalls, modelContent, usage } where `modelContent` is the
 * model's raw content (all parts as received, incl. thoughtSignature) so the
 * caller can append it verbatim to the conversation before sending tool results.
 */
async function streamChat({
  systemInstruction,
  contents,
  history,
  userMessage,
  tools,
  onToken,
  onToolCall,
}) {
  await takeToken();
  const model = getClient().getGenerativeModel({
    model: config.chatModel,
    systemInstruction,
    tools: tools && tools.length ? [{ functionDeclarations: tools }] : undefined,
    generationConfig: { temperature: 0.4 },
  });

  const convo = contents
    ? [...contents]
    : [
        ...(history || []),
        ...(userMessage ? [{ role: 'user', parts: [{ text: userMessage }] }] : []),
      ];

  let attempt = 0;
  let lastErr;
  while (attempt < 3) {
    try {
      const result = await model.generateContentStream({ contents: convo });
      const toolCalls = [];
      const rawParts = [];
      let text = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text() || '';
        if (chunkText) {
          text += chunkText;
          if (onToken) onToken(chunkText);
        }
        const calls = (chunk.functionCalls && chunk.functionCalls()) || [];
        for (const c of calls) {
          toolCalls.push(c);
          if (onToolCall) onToolCall(c);
        }
        const parts =
          chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content
            ? chunk.candidates[0].content.parts
            : null;
        if (Array.isArray(parts)) rawParts.push(...parts);
      }
      const final = await result.response;
      const modelContent = rawParts.length
        ? { role: 'model', parts: rawParts }
        : (final.candidates && final.candidates[0] && final.candidates[0].content) || null;
      return {
        text,
        toolCalls,
        modelContent,
        usage: final.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 },
      };
    } catch (e) {
      lastErr = e;
      attempt += 1;
      const is429 = e.status === 429 || (e.message && e.message.includes('429'));
      if (!is429) break;
      // Respect Gemini's retryDelay if provided ("10s", "33.5s"); otherwise
      // exponential backoff. Capped at 30s — beyond that the user is better
      // off seeing an error than waiting silently.
      let waitMs = 1000 * Math.pow(2, attempt);
      const retryInfo = (e.errorDetails || []).find((d) =>
        (d['@type'] || '').includes('RetryInfo')
      );
      if (retryInfo && typeof retryInfo.retryDelay === 'string') {
        const m = retryInfo.retryDelay.match(/^([\d.]+)s$/);
        if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000) + 500;
      }
      if (waitMs > 30_000) break;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function embed(text) {
  const model = getClient().getGenerativeModel({ model: config.embedModel });
  const res = await model.embedContent(text);
  return res.embedding.values;
}

module.exports = { streamChat, embed, _internal: { refill, getTokens: () => tokens } };
