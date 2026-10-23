// Accounts are Google accounts: the client sends a Google ID token once, we verify it
// against Google's public keys and hand back our own long-lived session token.
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_ISSUER = 'todomate';
const SESSION_TTL = '180d';

export class AuthError extends Error {}

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export type GoogleUser = { id: string; email: string; name?: string; picture?: string };

export async function verifyGoogleIdToken(idToken: string, nonce: string): Promise<GoogleUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured');
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    }));
  } catch {
    throw new AuthError('Invalid Google sign-in');
  }
  // The nonce ties the token to the sign-in this browser started (prevents replaying someone else's token).
  if (!nonce || payload.nonce !== nonce) throw new AuthError('Sign-in nonce mismatch');
  if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified === false) {
    throw new AuthError('Google account has no verified email');
  }
  return {
    id: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

export function createSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(sessionKey());
}

/** The signed-in user's id, from `Authorization: Bearer <session>`. */
export async function requireUser(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AuthError('Not signed in');
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { issuer: SESSION_ISSUER, algorithms: ['HS256'] });
    if (!payload.sub) throw new AuthError('Invalid session');
    return payload.sub;
  } catch {
    throw new AuthError('Session expired');
  }
}
