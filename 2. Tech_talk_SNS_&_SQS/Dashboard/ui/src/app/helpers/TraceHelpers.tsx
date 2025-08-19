/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/helpers/TraceHelpers.tsx
'use client';

import { JSX } from "react";

export type TracePart = { name: string; json?: any; raw?: string };
export type TraceDto = { id: string; steps: { key: string; data: any }[] };

// util mínimo para escapar html
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        m
      ]!)
  );

// 👉 si llega JSON de la API, lo transformo a la estructura HTML que
//    ya consume tu TraceAccordion/parsers
export function traceJsonToHtml(dto: TraceDto): string {
  return (dto.steps || [])
    .map((s) => {
      const name = s.key.split('/').pop() || s.key;
      const body = JSON.stringify(s.data ?? {});
      return `<div><code>${esc(name)}</code> — ${esc(body)}</div>`;
    })
    .join('');
}

/** Devuelve etiquetas/“chips” según el nombre del archivo */
export function chipsFor(name: string): JSX.Element[] {
  const chips: JSX.Element[] = [];

  if (/00-published/.test(name)) {
    chips.push(
      <span key="pub" className="px-2 py-0.5 bg-emerald-700 text-xs rounded">
        Published
      </span>
    );
  }
  if (/01-routes/.test(name)) {
    chips.push(
      <span key="routes" className="px-2 py-0.5 bg-blue-700 text-xs rounded">
        Routes
      </span>
    );
  }
  if (/fulfillment-received/.test(name)) {
    chips.push(
      <span key="frecv" className="px-2 py-0.5 bg-orange-700 text-xs rounded">
        F recv
      </span>
    );
  }
  if (/fulfillment-processed/.test(name)) {
    chips.push(
      <span key="fdone" className="px-2 py-0.5 bg-green-700 text-xs rounded">
        F done
      </span>
    );
  }
  if (/analytics-received/.test(name)) {
    chips.push(
      <span key="arecv" className="px-2 py-0.5 bg-orange-500 text-xs rounded">
        A recv
      </span>
    );
  }
  if (/analytics-processed/.test(name)) {
    chips.push(
      <span key="adone" className="px-2 py-0.5 bg-green-500 text-xs rounded">
        A done
      </span>
    );
  }
  if (/dlq/i.test(name)) {
    chips.push(
      <span key="dlq" className="px-2 py-0.5 bg-red-700 text-xs rounded">
        DLQ
      </span>
    );
  }

  return chips;
}

// Asegura que lo que llegue sea HTML string (acepta string o dto)
function ensureHtml(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'steps' in (detail as any)) {
    return traceJsonToHtml(detail as TraceDto);
  }
  return '';
}

/** Parsea el HTML a partes (nombre + json) */
export function parseTraceHtml(detailHtmlOrDto: unknown): TracePart[] {
  const detailHtml = ensureHtml(detailHtmlOrDto);
  if (!detailHtml) return [];

  try {
    const root = document.createElement('div');
    root.innerHTML = detailHtml;
    const parts: TracePart[] = [];
    root.querySelectorAll('div').forEach((div) => {
      const code = div.querySelector('code');
      if (!code) return;
      const name = (code.textContent || '').trim();
      const fullText = (div.textContent || '').trim();

      // lo que viene después del nombre "— {...}"
      const after = fullText
        .slice(fullText.indexOf(name) + name.length)
        .replace(/^—\s*/, '');

      let json: any | undefined;
      try {
        json = JSON.parse(after);
      } catch {}
      parts.push({ name, json, raw: json ? undefined : after });
    });
    return parts.length ? parts : [{ name: '#raw', raw: detailHtml }];
  } catch {
    return [{ name: '#raw', raw: detailHtml }];
  }
}

// ========= lo que ya tenías, pero tolerante a string o JSON =========
export type ParsedTrace = {
  cid: string;
  payload: any;
  forceDlq: 'pagos' | 'inv' | 'ship' | null;
};

export function parsedTraceFromHtml(
  detailHtmlOrDto: unknown
): ParsedTrace | null {
  const detailHtml = ensureHtml(detailHtmlOrDto);
  if (!detailHtml) return null;

  const parts = parseTraceHtml(detailHtml);

  // CID en el encabezado <b>...</b> si existe
  let cid = '';
  const cidTag = detailHtml.match(/<b>([a-f0-9-]{8,})<\/b>/i);
  if (cidTag) cid = cidTag[1];

  // payload: suele venir en 00-published.json
  const pub = parts.find((p) => p.name === '00-published.json');
  const payload = pub?.json?.message ?? pub?.json ?? null;

  // forceDlq heurístico según archivos de falla
  let forceDlq: 'pagos' | 'inv' | 'ship' | null = null;
  if (parts.some((p) => /30-fulfillment-failed/i.test(p.name)))
    forceDlq = 'inv';

  return { cid, payload, forceDlq };
}
