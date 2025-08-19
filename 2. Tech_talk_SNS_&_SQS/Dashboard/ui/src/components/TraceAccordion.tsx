// app/components/TraceAccordion.tsx
'use client';
import * as React from 'react';
import { parseTraceHtml, chipsFor } from '@/app/helpers/TraceHelpers';

export function TraceAccordion({
  detailHtml,
  cidToHighlight,
}: {
  detailHtml: string;
  cidToHighlight?: string;
}) {
  const parts = React.useMemo(() => parseTraceHtml(detailHtml), [detailHtml]);
  const hi = (s: string) =>
    cidToHighlight ? s.replaceAll(cidToHighlight, `<mark>${cidToHighlight}</mark>`) : s;

  return (
    <div className="space-y-2">
      {parts.map((p, i) => (
        <details key={`${p.name}-${i}`} className="rounded border border-slate-800 bg-slate-900/40">
          <summary className="cursor-pointer px-3 py-2 flex items-center justify-between gap-3">
            <div className="truncate">
              <code className="text-sky-300">{p.name}</code>
            </div>
            <div className="flex gap-1 flex-wrap">{chipsFor(p.name)}</div>
          </summary>
          <div className="px-3 pb-3">
            {p.json ? (
              <pre className="text-xs text-slate-200 overflow-auto">
                {JSON.stringify(p.json, null, 2)}
              </pre>
            ) : (
              <div
                className="text-xs text-slate-300 overflow-auto"
                dangerouslySetInnerHTML={{ __html: hi(p.raw || '') }}
              />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
