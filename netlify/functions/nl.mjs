import { parseNlQuery } from '../../src/nl.js';

export const config = { path: '/api/nl' };

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }
  let query = '';
  try {
    const body = await req.json();
    query = String(body.query || '').trim();
  } catch {
    /* fall through to the empty-query error */
  }
  if (!query) return Response.json({ error: 'query is required' }, { status: 400 });
  try {
    const params = await parseNlQuery(query);
    return Response.json({ params });
  } catch (err) {
    return Response.json(
      { error: `Could not interpret query: ${String(err.message || err)}` },
      { status: err.statusCode || 502 }
    );
  }
};
