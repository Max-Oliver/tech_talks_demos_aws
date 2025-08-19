// app/helpers/JsonConverter.ts
export function jsonToB64(obj: unknown): string {
  try {
    const s = JSON.stringify(obj);
    // soporta unicode
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return '';
  }
}

export function b64ToJson<T = unknown>(b64: string): T {
  try {
    const s = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(s) as T;
  } catch {
    return {} as T;
  }
}
