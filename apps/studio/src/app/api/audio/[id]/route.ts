import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/server/auth';
import { audioIdOf, readAudio } from '@/lib/server/repo';

/** Écoute d'une proposition audio par un relecteur connecté. L'id est celui de la contribution. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser();
  if (user === null || !user.roles.includes('reviewer')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const audioId = await audioIdOf((await context.params).id);
  const audio = audioId === null ? null : await readAudio(audioId);
  if (audio === null) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return new Response(new Uint8Array(audio.data), { headers: { 'content-type': audio.type, 'cache-control': 'private, no-store' } });
}
