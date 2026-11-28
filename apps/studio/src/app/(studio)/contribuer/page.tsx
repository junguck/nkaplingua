import type { ReactNode } from 'react';
import { LanguagePicker } from '@/components/language-picker';
import { requireUser } from '@/lib/server/auth';
import { nextReference } from '@/lib/server/repo';
import { pickLang } from '../lang';
import { ContributeForm } from './contribute-form';

export const dynamic = 'force-dynamic';

export default async function ContributePage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactNode> {
  const user = await requireUser('contributor');
  const params = await searchParams;
  const lang = pickLang(user, params.lang);
  if (lang === null) return <p>Aucune langue attribuée à ce compte.</p>;
  const skip = typeof params.skip === 'string' ? params.skip.split(',').slice(0, 50) : [];
  const reference = await nextReference(user, lang, skip);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Contribuer</h1>
        <LanguagePicker languages={user.languages} value={lang} />
      </div>
      {reference === null ? (
        <p className="text-muted-foreground">Tout est traduit ou en attente de relecture pour cette langue. Merci !</p>
      ) : (
        <ContributeForm
          key={`${lang}:${reference._id}`}
          lang={lang}
          reference={{ key: reference._id, fr: reference.fr, context: reference.context, maxChars: reference.maxChars, channels: [...reference.channels] }}
          skip={skip}
        />
      )}
    </div>
  );
}
