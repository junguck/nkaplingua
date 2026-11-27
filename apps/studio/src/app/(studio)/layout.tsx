import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/server/auth';
import { logoutAction } from './actions';

export default async function StudioLayout({ children }: { readonly children: ReactNode }): Promise<ReactNode> {
  const user = await requireUser();
  const reviewer = user.roles.includes('reviewer');
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold">NkapLingua Studio</Link>
          <nav className="flex gap-1">
            <Button asChild variant="ghost" size="sm"><Link href="/">Tableau</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href="/contribuer">Contribuer</Link></Button>
            {reviewer && <Button asChild variant="ghost" size="sm"><Link href="/valider">Valider</Link></Button>}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span>{user.displayName}</span>
            {user.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}
            <form action={logoutAction}><Button size="sm" variant="outline" type="submit">Sortir</Button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
