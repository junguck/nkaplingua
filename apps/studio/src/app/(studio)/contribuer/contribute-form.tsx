'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Language } from '@nkap/lingua-core';
import { AudioRecorder } from '@/components/audio-recorder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { blockingIssues, checkProposal } from '@/lib/checks';
import { submitAction } from '../actions';

export interface ReferenceView {
  readonly key: string;
  readonly fr: string;
  readonly context: string | null;
  readonly maxChars: number | null;
  readonly channels: readonly string[];
}

function Check({ ok, children }: { readonly ok: boolean; readonly children: ReactNode }): ReactNode {
  return <li className={ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>{ok ? '✓' : '✗'} {children}</li>;
}

export function ContributeForm({ lang, reference, skip }: { readonly lang: Language; readonly reference: ReferenceView; readonly skip: readonly string[] }): ReactNode {
  const router = useRouter();
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [pending, startTransition] = useTransition();
  const checks = useMemo(() => checkProposal(reference.fr, text, lang, reference.maxChars), [reference, text, lang]);
  const issues = text.trim() === '' ? [] : blockingIssues(checks);
  const conversational = reference.channels.some((c) => c === 'ussd' || c === 'sms');

  function submit(): void {
    const form = new FormData();
    form.set('key', reference.key);
    form.set('lang', lang);
    form.set('text', text);
    if (audio !== null) form.set('audio', new File([audio], 'proposition.webm', { type: audio.type }));
    startTransition(async () => {
      const result = await submitAction(form);
      if (result.ok) {
        toast.success('Proposition envoyée. Un second locuteur va la relire.');
        router.refresh();
      } else {
        toast.error(result.errors.join(' · '));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex flex-wrap gap-2">
          <Badge variant="outline">{reference.key}</Badge>
          {reference.channels.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          {reference.maxChars !== null && <Badge>{reference.maxChars} caractères max</Badge>}
        </CardDescription>
        <CardTitle className="text-2xl leading-snug">{reference.fr}</CardTitle>
        {reference.context !== null && <p className="text-sm text-muted-foreground">Contexte : {reference.context}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="text">Votre traduction</Label>
          <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} rows={3} lang={lang} placeholder="Écrivez comme vous le diriez à un proche." />
        </div>
        {text.trim() !== '' && (
          <ul className="space-y-1 text-sm">
            <Check ok={checks.placeholdersOk}>{checks.expectedPlaceholders === '' ? 'Aucun emplacement à conserver' : `Emplacements ${checks.expectedPlaceholders} conservés`}</Check>
            <Check ok={checks.lengthOk}>{checks.length} caractères{checks.maxChars !== null ? ` / ${checks.maxChars}` : ''}</Check>
            {conversational && <Check ok={checks.ussdFits}>USSD : {checks.ussdSeptets} septets / 182</Check>}
            {checks.identicalToSource && <li className="text-amber-600">Identique au français : est-ce vraiment traduit ?</li>}
          </ul>
        )}
        {conversational && text.trim() !== '' && (
          <div className="rounded-md bg-muted p-3 font-mono text-sm">
            <div className="mb-1 text-xs text-muted-foreground">Aperçu sur un téléphone basique (tons pliés en GSM-7)</div>
            {checks.ussdPreview}
          </div>
        )}
        <div className="space-y-2">
          <Label>Ou dites-la (enregistrement pour le serveur vocal)</Label>
          <AudioRecorder onChange={setAudio} />
        </div>
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => router.push(`/contribuer?lang=${lang}&skip=${[...skip, reference.key].join(',')}`)}>Passer</Button>
        <Button onClick={submit} disabled={pending || issues.length > 0 || (text.trim() === '' && audio === null)}>
          {pending ? 'Envoi…' : 'Proposer'}
        </Button>
      </CardFooter>
    </Card>
  );
}
