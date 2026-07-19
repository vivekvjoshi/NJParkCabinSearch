import { parseNlQuery } from '../../../src/nl.js';
import guard from '../../../src/guard.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

export async function POST(request) {
  const rl = guard.rateLimit(`nl:${guard.clientIp(request)}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: `rate limit exceeded — try again in ${rl.retryAfterSec}s` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }
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
