/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/helpers/TraceTimeline.tsx
'use client';
import * as React from 'react';
import { parseTraceHtml } from './TraceHelpers';

type TimelineItem = { t?: number; text: string };

// intenta tomar timestamp consistente de cada parte
function getTs(json: any): number | undefined {
  return (
    Number(json?.t) ||
    Number(json?.timestamp) ||
    (json?.message && Number(json.message.t)) ||
    undefined
  );
}

// mapea nombres de archivo -> texto humano
function makeTimeline(parts: ReturnType<typeof parseTraceHtml>): TimelineItem[] {
  const push = (text: string, t?: number) => ({ text, t });
  const out: TimelineItem[] = [];

  for (const p of parts) {
    const name = p.name || '';
    const j = p.json ?? {};
    const ts = getTs(j);

    if (/00-published\.json$/i.test(name)) {
      const evt = j?.message?.eventType || j?.eventType || 'OrderPlaced';
      out.push(push(`Producer publicó ${evt} en SNS Topic`, ts));
      continue;
    }
    if (/01-routes\.json$/i.test(name)) {
      out.push(push('SNS Topic fanout → entrega a suscriptores (SQS)', ts));
      continue;
    }
    if (/10-fulfillment-received\.json$/i.test(name)) {
      out.push(push('10 fulfillment received', ts));
      continue;
    }
    if (/11-analytics-received\.json$/i.test(name)) {
      out.push(push('11 analytics received', ts));
      continue;
    }
    if (/20-fulfillment-processed\.json$/i.test(name)) {
      out.push(push('Fulfillment procesó / reservó inventario', ts));
      continue;
    }
    if (/21-analytics-processed\.json$/i.test(name)) {
      out.push(push('Analytics actualizó métricas', ts));
      continue;
    }
    if (/\b30-fulfillment-reserved-/i.test(name)) {
      const prod = name.split('30-fulfillment-reserved-')[1]?.replace(/\.json$/,'') || '';
      out.push(push(`30 fulfillment reserved ${prod}`, ts));
      continue;
    }
    if (/\b40-analytics-updated-/i.test(name)) {
      const prod = name.split('40-analytics-updated-')[1]?.replace(/\.json$/,'') || '';
      out.push(push(`40 analytics updated ${prod}`, ts));
      continue;
    }
  }

  // orden por timestamp si hay, si no por orden natural
  return out.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

export function TraceTimeline({ detailHtml }: { detailHtml: string }) {
  const parts = React.useMemo(() => parseTraceHtml(detailHtml), [detailHtml]);
  const items = React.useMemo(() => makeTimeline(parts), [parts]);

  if (!items.length) return null;

  return (
    <ul className="mb-4 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-[6px] inline-block w-2 h-2 rounded-full bg-sky-400" />
          <div className="text-sm text-slate-200">
            {it.t ? (
              <span className="text-slate-400 mr-2 tabular-nums">
                {new Date(it.t).toLocaleTimeString([], { hour12: false })}
              </span>
            ) : null}
            {it.text}
          </div>
        </li>
      ))}
    </ul>
  );
}
