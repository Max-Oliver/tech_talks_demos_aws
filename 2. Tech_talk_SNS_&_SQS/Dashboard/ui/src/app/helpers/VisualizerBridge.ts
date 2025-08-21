// app/helpers/VisualizerBridge.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export const API =
  process.env.NEXT_PUBLIC_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export async function fetchPublishedPayloadByCid(cid: string): Promise<any | null> {
  const enc = encodeURIComponent(cid);

  // 1) preferido: robusto con fallbacks en el server
  try {
    const r = await fetch(`${API}/published/${enc}`);
    if (r.ok) {
      const j = await r.json();
      // /published/:cid responde { ok, cid, message } o { ...payload } según tu implementación
      return j?.message ?? j ?? null;
    }
  } catch {/* noop */}

  // 2) fallback: tu endpoint directo
  try {
    const r2 = await fetch(`${API}/trace/${enc}/published`);
    if (r2.ok) {
      // aquí tu server devuelve el payload “plano”
      return await r2.json();
    }
  } catch {/* noop */}

  return null;
}
