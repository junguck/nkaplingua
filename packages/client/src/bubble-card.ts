import type { LanguageCode } from '@nkap/contracts';
import { readScreen, renderPart, renderScreenCard, type ScreenAlertLevel } from '@nkap/core';
import { needsReviewBadge, statusLabel, t } from './ui-text';

/** Ce que le module natif transmet après un toucher de la bulle (jamais en arrière-plan). */
export type ScreenReadStatus = 'ok' | 'not_allowed' | 'accessibility_off' | 'empty';

export interface ScreenReadEvent {
  readonly status: ScreenReadStatus;
  readonly packageName: string | null;
  /** Vide sauf si `status === 'ok'` : une appli hors liste n'est même pas parcourue. */
  readonly lines: readonly string[];
}

/** Fiche prête à dessiner par la vue native Kotlin : du texte déjà rendu, aucune logique. */
export interface BubbleCardPayload {
  readonly title: string;
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly alerts: ReadonlyArray<{ readonly level: ScreenAlertLevel; readonly text: string }>;
  readonly footer: string;
}

export function bubbleCardFor(event: ScreenReadEvent, lang: LanguageCode): BubbleCardPayload {
  const title = renderPart({ kind: 'message', key: 'screen.title' }, lang).text;
  switch (event.status) {
    case 'accessibility_off':
      return { title, rows: [], alerts: [{ level: 'warning', text: t('ui.bubble.accessibilityOff', lang) }], footer: '' };
    case 'not_allowed':
      return { title, rows: [], alerts: [{ level: 'info', text: renderPart({ kind: 'message', key: 'screen.notAllowed' }, lang).text }], footer: event.packageName ?? '' };
    case 'empty':
    case 'ok': {
      const card = renderScreenCard(readScreen(event.lines), lang);
      const notes = [statusLabel(card.status, lang), needsReviewBadge(card.status) ? t('ui.unvalidated', lang) : null, card.fallback ? t('ui.fallback', lang) : null];
      return {
        title: card.title,
        rows: card.rows.map(({ label, value }) => ({ label, value })),
        alerts: card.alerts,
        footer: notes.filter((n): n is string => n !== null).join(' · '),
      };
    }
  }
}
