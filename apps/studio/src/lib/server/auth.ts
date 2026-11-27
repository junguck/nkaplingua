import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { COLLECTIONS, languageSchema, type Language } from '@nkap/lingua-core';
import { verifyPassword } from '@nkap/lingua-core/server';
import { db } from './db';
import { SESSION_COOKIE, signSession, verifySession } from '../session-token';
import { env } from './env';

export const ROLES = ['contributor', 'reviewer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userDocSchema = z.object({
  _id: z.instanceof(ObjectId),
  username: z.string(),
  displayName: z.string(),
  passwordHash: z.string(),
  roles: z.array(z.enum(ROLES)),
  languages: z.array(languageSchema),
});

export interface StudioUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
  readonly languages: readonly Language[];
}

/** Vérifie le mot de passe à temps constant ; un utilisateur inconnu coûte le même calcul. */
export async function login(username: string, password: string): Promise<StudioUser | null> {
  const raw = await (await db()).collection(COLLECTIONS.users).findOne({ username });
  const parsed = userDocSchema.safeParse(raw);
  const ok = await verifyPassword(password, parsed.success ? parsed.data.passwordHash : 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (!parsed.success || !ok) return null;
  const user = toUser(parsed.data);
  const token = await signSession({ sub: user.id }, env().STUDIO_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 3600,
  });
  return user;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Relit l'utilisateur en base à chaque requête : un rôle retiré prend effet immédiatement. */
export async function currentUser(): Promise<StudioUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token === undefined) return null;
  const claims = await verifySession(token, env().STUDIO_SECRET);
  if (claims === null || !ObjectId.isValid(claims.sub)) return null;
  const parsed = userDocSchema.safeParse(await (await db()).collection(COLLECTIONS.users).findOne({ _id: new ObjectId(claims.sub) }));
  return parsed.success ? toUser(parsed.data) : null;
}

export async function requireUser(role: Role = 'contributor'): Promise<StudioUser> {
  const user = await currentUser();
  if (user === null) redirect('/login');
  if (!user.roles.includes(role)) redirect('/?interdit=1');
  return user;
}

function toUser(doc: z.infer<typeof userDocSchema>): StudioUser {
  return { id: doc._id.toHexString(), username: doc.username, displayName: doc.displayName, roles: doc.roles, languages: doc.languages };
}
