/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/helpers/traceJsonToHtml.ts
export type TraceStep = { key: string; data: any };
export type TraceResponse = { id: string; steps: TraceStep[] };

export function traceJsonToHtml(resp: TraceResponse): string {
  const { id, steps } = resp;
  const blocks = steps.map((s) => {
    const name = s.key.split('/').pop() || s.key; // "00-published.json"
    const json = JSON.stringify(s.data, null, 2);
    return `<div style="margin:8px 0"><code>${name}</code> — ${json}</div>`;
  });
  return `<div><div style="margin-bottom:8px">Trace <b>${id}</b></div>${blocks.join('')}</div>`;
}