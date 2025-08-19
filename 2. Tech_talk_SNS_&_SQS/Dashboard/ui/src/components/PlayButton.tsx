// app/components/PlayButton.tsx
'use client';
import { useRouter } from 'next/navigation';
import { jsonToB64 } from '@/app/helpers/JsonConverter';
import type { ParsedTrace } from '@/app/helpers/TraceHelpers';

export function PlayButton({ parsed }: { parsed: ParsedTrace | null }) {
  const router = useRouter();
  const hasPayload = !!parsed?.payload;
  const hasCid = !!parsed?.cid;

  const onClick = () => {
    if (hasPayload) {
      const b64 = encodeURIComponent(jsonToB64(parsed!.payload));
      router.push(`/visualizer?mode=auto&payload=${b64}`);
    } else if (hasCid) {
      router.push(`/visualizer?mode=auto&cid=${encodeURIComponent(parsed!.cid)}`);
    }
  };

  return (
    <button
      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
      disabled={!hasPayload && !hasCid}
      onClick={onClick}
    >
      ▶ Reproducir
    </button>
  );
}
