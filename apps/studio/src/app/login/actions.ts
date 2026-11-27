'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { login } from '@/lib/server/auth';

export interface LoginState {
  readonly error: string | null;
}

const schema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ username: form.get('username'), password: form.get('password') });
  if (!parsed.success) return { error: 'Identifiant et mot de passe requis.' };
  const user = await login(parsed.data.username, parsed.data.password);
  if (user === null) return { error: 'Identifiants incorrects.' };
  redirect('/');
}
