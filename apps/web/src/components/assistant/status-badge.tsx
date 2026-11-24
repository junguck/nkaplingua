'use client';

import { needsReviewBadge, statusLabel, t } from '@nkap/client';
import type { LanguageCode, TranslationStatus } from '@nkap/contracts';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StatusBadgeProps {
  readonly status: TranslationStatus;
  readonly fallback: boolean;
  readonly lang: LanguageCode;
}

/** Honnêteté linguistique : le statut le plus faible de la réponse est toujours visible. */
export function StatusBadge({ status, fallback, lang }: StatusBadgeProps): JSX.Element {
  const review = needsReviewBadge(status);
  const notes = [review ? t('ui.unvalidated', lang) : null, fallback ? t('ui.fallback', lang) : null, t('ui.lockedValues', lang)].filter(
    (n): n is string => n !== null,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={review ? 'warning' : 'success'} tabIndex={0}>
          {review ? <ShieldAlert /> : <ShieldCheck />}
          {statusLabel(status, lang)}
          {fallback ? ' · FR' : ''}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{notes.join(' · ')}</TooltipContent>
    </Tooltip>
  );
}
