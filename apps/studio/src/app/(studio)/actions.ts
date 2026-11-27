'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { logout, requireUser } from '@/lib/server/auth';
import { review, submitContribution, type SubmitResult } from '@/lib/server/repo';

export async function submitAction(form: FormData): Promise<SubmitResult> {
  const user = await requireUser('contributor');
  const audio = form.get('audio');
  const result = await submitContribution(
    user,
    { key: form.get('key'), lang: form.get('lang'), text: form.get('text') ?? '' },
    audio instanceof File && audio.size > 0 ? audio : null,
  );
  if (result.ok) revalidatePath('/contribuer');
  return result;
}

export async function reviewAction(input: { id: string; decision: 'approve'; transcript?: string } | { id: string; decision: 'reject'; reason: string }): Promise<SubmitResult> {
  const user = await requireUser('reviewer');
  const result = await review(user, input);
  if (result.ok) revalidatePath('/valider');
  return result;
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/login');
}
