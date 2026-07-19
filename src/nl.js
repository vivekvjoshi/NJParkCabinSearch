// Natural-language query → structured search params, via NVIDIA's
// OpenAI-compatible API. Shared by the Express server and the Netlify function.

const nj = require('./njoutdoors');

function nlSystemPrompt() {
  const parks = Object.entries(nj.PARKS)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  const types = Object.entries(nj.SITE_TYPES)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  const features = Object.entries(nj.FEATURES)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  return `You convert a camper's natural-language request into search parameters for a New Jersey state park campsite finder. Today is ${nj.todayISO()}.

Park IDs: ${parks}
Site type IDs: ${types}
Feature IDs: ${features}

Respond with ONLY a JSON object, no prose, no markdown fences:
{
  "mode": "weekend" | "date",          // "weekend" = scan every weekend of a month; "date" = a specific arrival date
  "month": "YYYY-MM",                  // weekend mode only
  "arrival": 4 | 5 | 6,                // weekend mode only: arrival weekday Thu=4, Fri=5, Sat=6 (checkout is always Sunday); default 5
  "date": "YYYY-MM-DD",                // date mode only: arrival date (never in the past)
  "nights": 1-14,                      // date mode only; default 2
  "types": [ids],                      // site types; default [1] (Cabin) if the user doesn't clearly ask for something else
  "features": [ids],                   // only features the user explicitly asks for
  "flushOnly": true|false,             // true if they want flush toilets / "real bathrooms"
  "minPeople": 0,                      // party size if mentioned
  "parks": [ids],                      // empty array = all parks; fill only if specific parks/regions are named
  "note": "one short sentence explaining your interpretation"
}

If the request mentions a weekend, a month, or is vague about dates, prefer "weekend" mode. Map "showers" to feature 14, "electric" to 6, "waterfront/lake" to 4 (Boat Access), "wheelchair" to 1.`;
}

function extractJson(text) {
  // strip any reasoning/prose around the JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in model response');
  return JSON.parse(text.slice(start, end + 1));
}

async function parseNlQuery(query) {
  const apiKey = process.env.NVIDIA_API_KEY || '';
  const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
  if (!apiKey) {
    const err = new Error('Natural-language search is not configured. Set the NVIDIA_API_KEY environment variable.');
    err.statusCode = 503;
    throw err;
  }

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: nlSystemPrompt() },
        { role: 'user', content: query },
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false },
      stream: false,
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`NVIDIA API ${r.status}: ${detail.slice(0, 300)}`);
  }
  const data = await r.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content || ''
    : '';
  const parsed = extractJson(content);

  // sanitize against the known ID tables
  const params = {
    mode: parsed.mode === 'date' ? 'date' : 'weekend',
    month: /^\d{4}-\d{2}$/.test(parsed.month || '') ? parsed.month : null,
    arrival: [4, 5, 6].includes(parsed.arrival) ? parsed.arrival : 5,
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? parsed.date : null,
    nights: Math.min(14, Math.max(1, parseInt(parsed.nights, 10) || 2)),
    types: (Array.isArray(parsed.types) ? parsed.types : []).filter((t) => nj.SITE_TYPES[t]),
    features: (Array.isArray(parsed.features) ? parsed.features : []).filter((f) => nj.FEATURES[f]),
    flushOnly: Boolean(parsed.flushOnly),
    minPeople: Math.max(0, parseInt(parsed.minPeople, 10) || 0),
    parks: (Array.isArray(parsed.parks) ? parsed.parks : []).filter((p) => nj.PARKS[p]),
    note: typeof parsed.note === 'string' ? parsed.note : '',
  };
  if (!params.types.length) params.types = [1];
  return params;
}

module.exports = { parseNlQuery, extractJson };
