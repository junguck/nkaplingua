import type { ReactNode } from 'react';
import { LanguagePicker } from '@/components/language-picker';
import { requireUser } from '@/lib/server/auth';
import { reviewQueue } from '@/lib/server/repo';
import { pickLang } from '../lang';
import { ReviewCard } from './review-card';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactNode> {
  const user = await requireUser('reviewer');
  const lang = pickLang(user, (await searchParams).lang);
  if (lang === null) return <p>Aucune langue attribuée à ce compte.</p>;
  const queue = await reviewQueue(user, lang);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Valider</h1>
          <p className="text-sm text-muted-foreground">Vos propres propositions n’apparaissent jamais ici.</p>
        </div>
        <LanguagePicker languages={user.languages} value={lang} />
      </div>
      {queue.length === 0 ? <p className="text-muted-foreground">Rien à relire pour le moment.</p> : queue.map((c) => <ReviewCard key={c.id} item={c} />)}
    </div>
  );
}
