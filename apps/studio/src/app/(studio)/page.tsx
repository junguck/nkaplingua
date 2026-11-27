import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LANGUAGE_LABELS } from '@/lib/checks';
import { requireUser } from '@/lib/server/auth';
import { coverage } from '@/lib/server/repo';

export const dynamic = 'force-dynamic';

export default async function Dashboard(): Promise<ReactNode> {
  const user = await requireUser();
  const rows = await coverage(user.languages);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Couverture par langue</h1>
        <p className="text-sm text-muted-foreground">
          Une phrase n’est servie aux clients qu’après validation par un second locuteur. Chaque validation est publiée à chaud.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const pct = row.total === 0 ? 0 : Math.round((Math.min(row.validated, row.total) / row.total) * 100);
          return (
            <Card key={row.lang}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  {LANGUAGE_LABELS[row.lang]} <Badge variant="outline">{row.lang}</Badge>
                </CardTitle>
                <CardDescription>{row.validated} validées sur {row.total} · {row.pending} en attente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={pct} aria-label={`${pct} %`} />
                <div className="flex gap-2">
                  <Button asChild size="sm"><Link href={`/contribuer?lang=${row.lang}`}>Contribuer</Link></Button>
                  {user.roles.includes('reviewer') && row.pending > 0 && (
                    <Button asChild size="sm" variant="outline"><Link href={`/valider?lang=${row.lang}`}>Relire ({row.pending})</Link></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
