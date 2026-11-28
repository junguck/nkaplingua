'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { blockingIssues, checkProposal } from '@/lib/checks';
import type { ContributionView } from '@/lib/server/repo';
import { reviewAction } from '../actions';

export function ReviewCard({ item }: { readonly item: ContributionView }): ReactNode {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [transcript, setTranscript] = useState('');
  const [pending, startTransition] = useTransition();
  const text = item.text ?? transcript;
  const issues = text.trim() === '' ? ['Transcription requise'] : blockingIssues(checkProposal(item.reference.fr, text, item.lang, item.reference.maxChars));

  function decide(input: Parameters<typeof reviewAction>[0]): void {
    startTransition(async () => {
      const result = await reviewAction(input);
      if (result.ok) {
        toast.success(input.decision === 'approve' ? 'Publiée : servie dès maintenant par le middleware.' : 'Rejetée.');
        router.refresh();
      } else toast.error(result.errors.join(' · '));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex flex-wrap gap-2">
          <Badge variant="outline">{item.key}</Badge>
          <span>par {item.authorName}</span>
        </CardDescription>
        <CardTitle className="text-lg font-normal text-muted-foreground">{item.reference.fr}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.text !== null ? (
          <p className="text-xl" lang={item.lang}>{item.text}</p>
        ) : (
          <Input value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Proposition orale : transcrivez-la" />
        )}
        {item.hasAudio && <audio controls preload="none" src={`/api/audio/${item.id}`} className="w-full" />}
        {item.current !== null && <p className="text-sm text-muted-foreground">Version publiée actuelle : {item.current}</p>}
        {issues.length > 0 && <p className="text-sm text-destructive">{issues.join(' · ')}</p>}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif du rejet (obligatoire pour rejeter)" />
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending || reason.trim().length < 3} onClick={() => decide({ id: item.id, decision: 'reject', reason })}>Rejeter</Button>
        <Button disabled={pending || issues.length > 0} onClick={() => decide(item.text === null ? { id: item.id, decision: 'approve', transcript } : { id: item.id, decision: 'approve' })}>
          Valider et publier
        </Button>
      </CardFooter>
    </Card>
  );
}
