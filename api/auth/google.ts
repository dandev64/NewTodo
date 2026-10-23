// POST /api/auth/google  { idToken, nonce }  →  { token, user }
import { db, json, readJson } from '../_lib/http.js';
import { AuthError, createSession, verifyGoogleIdToken } from '../_lib/session.js';

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const idToken = typeof body?.idToken === 'string' ? body.idToken : '';
  const nonce = typeof body?.nonce === 'string' ? body.nonce : '';
  if (!idToken) return json(400, { error: 'idToken is required' });

  try {
    const user = await verifyGoogleIdToken(idToken, nonce);
    const sql = db();
    await sql`
      insert into users (id, email, name, picture)
      values (${user.id}, ${user.email}, ${user.name ?? null}, ${user.picture ?? null})
      on conflict (id) do update
        set email = excluded.email, name = excluded.name, picture = excluded.picture, last_seen_at = now()
    `;
    return json(200, { token: await createSession(user.id), user });
  } catch (e) {
    if (e instanceof AuthError) return json(401, { error: e.message });
    console.error('auth/google failed', e);
    return json(500, { error: 'Sign-in failed' });
  }
}
