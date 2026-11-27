/** Jeton de session HS256, vérifiable aussi dans le middleware Edge de Next (jose, sans node:crypto). */
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'nkap_session';

export interface SessionClaims {
  readonly sub: string;
}

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(claims.sub).setIssuedAt().setExpirationTime('8h').sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}
