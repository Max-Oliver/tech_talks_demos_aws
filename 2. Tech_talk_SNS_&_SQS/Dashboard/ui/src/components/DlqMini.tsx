/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Button } from "./ui/button";
import { fetchSafe, API } from "@/app/monitor/page";
import { btnGhost, btnPrimary } from "@/lib/utils";

export function DlqMini() {
  const [queue, setQueue] = React.useState('demo-thr-dlq');
  const [source, setSource] = React.useState('demo-thr');
  const [items, setItems] = React.useState<{id:string;receipt:string;body:any}[]>([]);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchSafe<any[]>(`${API}/dlq/${queue}/peek?max=10`);
      setItems(r);
    } finally {
      setLoading(false);
    }
  }
  async function retryOne(m: any) {
    console.log('retry', m);
    await fetchSafe(`${API}/dlq/${queue}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, receipt: m.receipt, body: m.body }),
    });
    await load();
  }
  async function purge() {
    await fetchSafe(`${API}/dlq/${queue}/purge`, { method: 'DELETE' });
    await load();
  }

  React.useEffect(() => { void load(); }, [queue]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <select
          className="bg-slate-900/70 border border-slate-800 rounded px-2 py-1"
          value={queue}
          onChange={(e) => setQueue(e.target.value)}
        >
          <option>demo-thr-dlq</option>
          <option>demo-shipping-sqs-dlq</option>
          <option>demo-analytics-sqs-dlq</option>
          <option>demo-fulfill-sqs-dlq</option>
        </select>
        <span className="text-slate-400 text-sm">reintentar hacia</span>
        <select
          className="bg-slate-900/70 border border-slate-800 rounded px-2 py-1"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option>demo-thr</option>
          <option>demo-analytics-sqs</option>
          <option>demo-shipping-sqs</option>
          <option>demo-fulfill-sqs</option>
        </select>
        <Button className={btnGhost} onClick={load} disabled={loading}>Refrescar</Button>
        <Button variant="outline" onClick={purge} disabled={loading}>Purgar</Button>
      </div>

      {!items.length && <em className="text-slate-400">Sin mensajes.</em>}

      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.id} className="border border-slate-800 rounded p-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-300">{m.id}</div>
              <Button className={btnPrimary} size="sm" onClick={() => retryOne(m)}>
                Reintentar → {source}
              </Button>
            </div>
            <pre className="text-xs text-slate-400 overflow-auto mt-2">
              {JSON.stringify(m.body, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}