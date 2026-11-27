'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Language } from '@nkap/lingua-core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANGUAGE_LABELS } from '@/lib/checks';

export function LanguagePicker({ languages, value }: { readonly languages: readonly Language[]; readonly value: Language }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select value={value} onValueChange={(lang) => router.push(`${pathname}?lang=${lang}`)}>
      <SelectTrigger className="w-48" aria-label="Langue"><SelectValue /></SelectTrigger>
      <SelectContent>
        {languages.map((lang) => <SelectItem key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
