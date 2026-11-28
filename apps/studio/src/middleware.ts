import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session-token';

/** Barrière Edge : sans session valide, tout renvoie vers /login. Le rôle est revérifié côté serveur. */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.STUDIO_SECRET ?? '';
  const valid = token !== undefined && secret.length >= 32 && (await verifySession(token, secret)) !== null;
  if (valid) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = { matcher: ['/((?!login|_next/|favicon.ico).*)'] };
