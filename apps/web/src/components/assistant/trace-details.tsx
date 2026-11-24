import { t } from '@nkap/client';
import type { LanguageCode, Trace } from '@nkap/contracts';
import type { JSX } from 'react';

/** Ce que voit le jury (§6.D) : intention, paramètres, statut, temps, intégrité. */
export function TraceDetails({ trace, lang }: { readonly trace: Trace; readonly lang: LanguageCode }): JSX.Element {
  const params = Object.entries(trace.params);
  return (
    <details className="group mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">{t('ui.trace', lang)}</summary>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md bg-muted px-3 py-2 font-mono">
        <span>intent</span>
        <span className="text-foreground">
          {trace.intent} · {Math.round(trace.confidence * 100)} %
        </span>
        <span>status</span>
        <span className="text-foreground">{trace.status}</span>
        <span>lang</span>
        <span className="text-foreground">{trace.lang}</span>
        {params.map(([key, value]) => (
          <span key={key} className="contents">
            <span>{key}</span>
            <span className="break-all text-foreground">{String(value)}</span>
          </span>
        ))}
        <span>integrity</span>
        <span className={trace.validation.integrity ? 'text-success' : 'text-destructive'}>{trace.validation.integrity ? '✓' : '✗'}</span>
        <span>latency</span>
        <span className="text-foreground">{trace.latencyMs} ms</span>
      </div>
    </details>
  );
}
