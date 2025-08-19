// app/helpers/VisualizerBridge.ts
export const API =
  process.env.NEXT_PUBLIC_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001'; // ajusta a tu backend

// Intenta /trace-file?cid=...&name=00-published.json
// Si no existe, hace fallback a /trace?cid=... y parsea el HTML
export async function fetchPublishedPayloadByCid(cid: string): Promise<any | null> {
  try {
    const direct = await fetch(`${API}/trace-file?cid=${encodeURIComponent(cid)}&name=00-published.json`);
    if (direct.ok) {
      const txt = await direct.text();
      try {
        // El archivo suele ser: {"t":..., "message":{...payload}}
        const obj = JSON.parse(txt);
        return obj?.message ?? obj ?? null;
      } catch {}
    }
  } catch {}

  try {
    const res = await fetch(`${API}/trace?cid=${encodeURIComponent(cid)}`);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/00-published\.json[\s\S]*?—\s*(\{[\s\S]*\})/);
    if (!m) return null;
    const obj = JSON.parse(m[1]);
    return obj?.message ?? obj ?? null;
  } catch {
    return null;
  }
}
