import { parseNlQuery } from '../../../src/nl.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

export async function POST(request) {
  let query = '';
  try {
    const body = await request.json();
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
}
