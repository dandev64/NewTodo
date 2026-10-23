// POST /api/sync  { since, changes: [{ kind, id, data, updated_at, deleted }] }
//   → { changes: [...records with seq > since], cursor, hasMore }
//
// Each category / todo / settings object is one record. A write is accepted only if its
// updated_at is newer than what's stored (last write wins). Every accepted write gets a new
// seq; devices pull everything after the last seq they've seen. Writes for one user are
// serialized with an advisory lock so seqs become visible in order (no skipped records).
import { db, json, readJson } from './_lib/http.js';
import { AuthError, requireUser } from './_lib/session.js';

const KINDS = new Set(['goal', 'todo', 'settings']);
const MAX_CHANGES = 500;
const MAX_RECORD_BYTES = 32_000;
const PAGE = 1000;
/** Edits stamped further in the future than this (bad device clock) are clamped. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

type Change = { kind: string; id: string; data: unknown; updated_at: number; deleted: boolean };

function parseChanges(raw: unknown): Change[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return 'changes must be an array';
  if (raw.length > MAX_CHANGES) return `at most ${MAX_CHANGES} changes per request`;
  const now = Date.now();
  const out: Change[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') return 'invalid change';
    const { kind, id, data, updated_at, deleted } = c as Record<string, unknown>;
    if (typeof kind !== 'string' || !KINDS.has(kind)) return 'invalid kind';
    if (typeof id !== 'string' || id.length === 0 || id.length > 100) return 'invalid id';
    if (typeof updated_at !== 'number' || !Number.isFinite(updated_at) || updated_at <= 0) return 'invalid updated_at';
    if (typeof deleted !== 'boolean') return 'invalid deleted';
    if (!deleted && (!data || typeof data !== 'object' || Array.isArray(data))) return 'invalid data';
    if (!deleted && JSON.stringify(data).length > MAX_RECORD_BYTES) return 'record too large';
    out.push({ kind, id, data: deleted ? null : data, updated_at: Math.min(Math.round(updated_at), now + MAX_CLOCK_SKEW_MS), deleted });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUser(request);
  } catch (e) {
    if (e instanceof AuthError) return json(401, { error: e.message });
    console.error('sync auth failed', e);
    return json(500, { error: 'Server error' });
  }

  const body = await readJson(request);
  if (!body) return json(400, { error: 'invalid JSON body' });
  const since = typeof body.since === 'number' && body.since >= 0 ? Math.floor(body.since) : 0;
  const changes = parseChanges(body.changes);
  if (typeof changes === 'string') return json(400, { error: changes });

  try {
    const sql = db();
    const queries = [
      sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
      ...(changes.length
        ? [
            sql.query(
              `insert into records (user_id, kind, id, data, updated_at, deleted)
               select $1, c.kind, c.id, c.data, c.updated_at, c.deleted
               from jsonb_to_recordset($2::jsonb) as c(kind text, id text, data jsonb, updated_at bigint, deleted boolean)
               on conflict (user_id, kind, id) do update
                 set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted,
                     seq = nextval('records_seq')
                 where records.updated_at < excluded.updated_at`,
              [userId, JSON.stringify(changes)],
            ),
          ]
        : []),
      sql`
        select kind, id, data, updated_at, deleted, seq
        from records
        where user_id = ${userId} and seq > ${since}
        order by seq
        limit ${PAGE + 1}
      `,
    ];
    const results = await sql.transaction(queries);
    const rows = results[results.length - 1] as Record<string, unknown>[];
    const page = rows.slice(0, PAGE);
    const cursor = page.length ? Number(page[page.length - 1].seq) : since;
    return json(200, {
      changes: page.map((r) => ({
        kind: r.kind,
        id: r.id,
        data: r.data,
        updated_at: Number(r.updated_at),
        deleted: r.deleted,
      })),
      cursor,
      hasMore: rows.length > PAGE,
    });
  } catch (e) {
    console.error('sync failed', e);
    return json(500, { error: 'Sync failed' });
  }
}
