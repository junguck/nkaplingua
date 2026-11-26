'use client';

import { SUPPORTED_LANGUAGES, t } from '@nkap/client';
import { LANGUAGE_INFO, isLanguageCode } from '@nkap/contracts';
import { Languages } from 'lucide-react';
import type { JSX } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConversation, useNkap } from '@/lib/nkap';

/** Changer de langue = un tour du dialogue : l'opération en cours n'est pas perdue. */
export function LanguageSelect(): JSX.Element {
  const { chat } = useNkap();
  const { lang, pending } = useConversation();
  return (
    <Select
      value={lang}
      disabled={pending}
      onValueChange={(value) => {
        if (isLanguageCode(value) && value !== lang) void chat.switchLanguage(value, LANGUAGE_INFO[value].nativeName);
      }}
    >
      <SelectTrigger aria-label={t('ui.language', lang)} className="w-[9.5rem] border-white/25 bg-white/10 text-white">
        <Languages className="size-4 opacity-80" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((code) => (
          <SelectItem key={code} value={code}>
            {LANGUAGE_INFO[code].nativeName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
