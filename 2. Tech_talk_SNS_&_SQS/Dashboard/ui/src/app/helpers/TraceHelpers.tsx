// app/helpers/TraceHelpers.tsx
'use client';

export type TracePart = {
  name: string;
  json?: any;
  raw?: string;
};

export type ParsedTrace = {
  cid: string;
  payload: any | null;
  forceDlq: 'pagos' | 'inv' | 'ship' | null;
};

/** Parsea el HTML del backend: lista de partes (archivo + json) */
export function parseTraceHtml(detailHtml: string): TracePart[] {
  try {
    const root = document.createElement('div');
    root.innerHTML = detailHtml;
    const parts: TracePart[] = [];
    root.querySelectorAll('div').forEach((div) => {
      const code = div.querySelector('code');
      if (!code) return;
      const name = (code.textContent || '').trim();
      const full = (div.textContent || '').trim();
      const after = full.slice(full.indexOf(name) + name.length).replace(/^—\s*/, '');
      try {
        const json = JSON.parse(after);
        parts.push({ name, json });
      } catch {
        parts.push({ name, raw: after });
      }
    });
    return parts.length ? parts : [{ name: '#raw', raw: detailHtml }];
  } catch {
    return [{ name: '#raw', raw: detailHtml }];
  }
}

export function parsedTraceFromHtml(detailHtml: string): ParsedTrace | null {
  if (!detailHtml) return null;
  const parts = parseTraceHtml(detailHtml);

  // CID: primer <b>...</b> o algo parecido
  let cid = '';
  const cidTag = detailHtml.match(/<b>([a-f0-9-]{8,})<\/b>/i);
  if (cidTag) cid = cidTag[1];

  // Payload: suele ir en 00-published.json → .message o raíz
  const pub = parts.find((p) => p.name === '00-published.json');
  const payload = pub?.json?.message ?? pub?.json ?? null;

  // Heurística para DLQ: fulfillment-failed → 'inv'
  let forceDlq: 'pagos' | 'inv' | 'ship' | null = null;
  if (parts.some((p) => /30-fulfillment-failed\.json/i.test(p.name))) {
    forceDlq = 'inv';
  }

  return { cid, payload, forceDlq };
}

/** Chips de estado por nombre de archivo */
export function chipsFor(name: string) {
  const yes = (txt: string, key: string) => (
    <span key={key} className="px-2 py-[2px] rounded-full text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
      {txt}
    </span>
  );
  const no = (txt: string, key: string) => (
    <span key={key} className="px-2 py-[2px] rounded-full text-[11px] bg-slate-800/60 text-slate-300 border border-slate-700">
      {txt}
    </span>
  );

  // patrones conocidos
  if (/^00-published\.json$/i.test(name)) return [yes('Published', 'published')];
  if (/^01-routes\.json$/i.test(name)) return [yes('Route → F', 'routeF'), yes('Route → A', 'routeA')];
  if (/^10-fulfillment-received\.json$/i.test(name)) return [yes('Recv F', 'recvF')];
  if (/^11-analytics-received\.json$/i.test(name)) return [yes('Recv A', 'recvA')];
  if (/^20-fulfillment-processed\.json$/i.test(name)) return [yes('Done F', 'doneF')];
  if (/^21-analytics-processed\.json$/i.test(name)) return [yes('Done A', 'doneA')];
  if (/^30-fulfillment-failed\.json$/i.test(name)) return [no('Done F', 'doneF')];
  if (/^31-analytics-failed\.json$/i.test(name)) return [no('Done A', 'doneA')];
  if (/^[\w-]+-fulfillment-reserve-[\w-]+\.json$/i.test(name)) return [yes('Update Stock', 'updF')];
  if (/^[\w-]+-analytics-updated-[\w-]+\.json$/i.test(name)) return [yes('Update Metrics', 'updA')];
  if (/^50-dlq\.json$/i.test(name)) return [yes('DLQ', 'dlq')];

  return [];
}
