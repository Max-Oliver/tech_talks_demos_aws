/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/monitor/page.tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../components/ui/tabs';
import { TraceAccordion } from '../../components/TraceAccordion';
import { PlayButton } from '../../components/PlayButton';
import { ParsedTrace, parsedTraceFromHtml } from '../helpers/TraceHelpers';
import { jsonToB64 } from '../helpers/JsonConverter';
import { TopNav } from '@/components/TopNav';

export const API = process.env.NEXT_PUBLIC_API || 'http://localhost:4000';

// ===== types (backend-shape lightweight) =====
type QueueStat = {
  name: string;
  ApproximateNumberOfMessages?: number;
  ApproximateNumberOfMessagesNotVisible?: number;
  ApproximateNumberOfMessagesDelayed?: number;
};

type TraceSummary = {
  id: string; // correlationId
  published?: boolean; // 00
  f_recv?: boolean; // 10
  f_done?: boolean; // 20
  a_recv?: boolean; // 11
  a_done?: boolean; // 21
  routes?: any;
  ts?: number; // timestamp de última act.
};

type InventoryItem = {
  productId: string;
  currentStock: number;
  reservedUnits: number;
  updatedAt?: string;
};

type MetricItem = {
  productId: string;
  unitsSold: number;
  totalRevenue?: number;
};

type ReplenItem = {
  productId: string;
  missingUnits: number;
  orderId?: string;
  key?: string;
};

// ===== helpers =====
const field =
  'bg-slate-900/70 text-slate-100 placeholder:text-slate-500 border border-slate-800 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-slate-600';

export async function fetchSafe<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url} => ${res.status}`);
    return res.json() as Promise<T>;
  } catch (e: any) {
    console.error('fetchSafe error:', url, e);
    throw new Error(`Failed to fetch ${url}: ${e?.message || e}`);
  }
}

const dot = (on?: boolean) => (
  <span
    className={
      'inline-block w-2.5 h-2.5 rounded-full ' +
      (on ? 'bg-emerald-400' : 'bg-slate-700')
    }
  />
);

async function copy(txt: string) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {}
}

type TabKey = 'overview' | 'orders' | 'messaging' | 'storage' | 'traces';

// ===== page =====
export default function MonitoringPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // global UI state
  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');
  const [loading, setLoading] = React.useState(false);

  // header search (CID)
  const [cidQuery, setCidQuery] = React.useState(sp.get('cid') || '');

  // datasets
  const [queues, setQueues] = React.useState<QueueStat[]>([]);
  const [traces, setTraces] = React.useState<TraceSummary[]>([]);
  const [s3Orders, setS3Orders] = React.useState<string[]>([]);
  const [s3Analytics, setS3Analytics] = React.useState<string[]>([]);
  const [detail, setDetail] = React.useState<string>('');

  // “badges” auxiliares
  const [cidBadge, setCidBadge] = React.useState<string>('');

  // ---- Pedidos: crear orden ----
  const [submitting, setSubmitting] = React.useState(false);
  const [ordId, setOrdId] = React.useState('');
  const [ordCid, setOrdCid] = React.useState('');
  const [ordRows, setOrdRows] = React.useState<
    { productId: string; quantity: string; unitPrice: string }[]
  >([{ productId: '', quantity: '1', unitPrice: '100' }]);

  const addOrderRow = () =>
    setOrdRows((rows) => [
      ...rows,
      { productId: '', quantity: '1', unitPrice: '100' },
    ]);
  const removeOrderRow = (i: number) =>
    setOrdRows((rows) => rows.filter((_, idx) => idx !== i));

  // ---- Inventario: agregar productos ----
  const [inv, setInv] = React.useState<InventoryItem[]>([]);
  const [invRows, setInvRows] = React.useState<
    { productId: string; currentStock: string }[]
  >([{ productId: '', currentStock: '10' }]);
  const addInvRow = () =>
    setInvRows((rows) => [...rows, { productId: '', currentStock: '10' }]);
  const removeInvRow = (i: number) =>
    setInvRows((rows) => rows.filter((_, idx) => idx !== i));
  const clearInvRows = () =>
    setInvRows([{ productId: '', currentStock: '10' }]);

  const [met, setMet] = React.useState<MetricItem[]>([]);
  const [rep, setRep] = React.useState<ReplenItem[]>([]);

  // parsed trace (para PlayButton)
  const parsed: ParsedTrace | null = React.useMemo(
    () => (detail ? parsedTraceFromHtml(detail) : null),
    [detail]
  );

  // keep CID in URL so it survives tab switches
  const setCidAndURL = (v: string) => {
    setCidQuery(v);
    const url = new URL(location.href);
    if (v) url.searchParams.set('cid', v);
    else url.searchParams.delete('cid');
    history.replaceState(null, '', url.toString());
  };

  // load one trace by CID into accordion
  const showTrace = React.useCallback(async (cid: string) => {
    if (!cid) return;
    setActiveTab('traces');
    setCidAndURL(cid);
    setCidBadge(cid);
    try {
      const html = await fetchSafe<string>(
        `${API}/trace?cid=${encodeURIComponent(cid)}`
      );
      setDetail(html || '');
    } catch (e) {
      setDetail(
        `<em style="color:#f88">No pude cargar la traza para ${cid}</em>`
      );
    }
  }, []);

  // Global refresh (overview)
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [qs, ord, anl, ts] = await Promise.all([
        fetchSafe<QueueStat[]>(`${API}/queues`),
        fetchSafe<string[]>(`${API}/files?prefix=orders/`),
        fetchSafe<string[]>(`${API}/files?prefix=analytics/`),
        fetchSafe<TraceSummary[]>(`${API}/traces`),
      ]);
      setQueues(qs);
      setS3Orders(ord);
      setS3Analytics(anl);
      // Ordena por ts desc si hay; si no, deja última posición como “más nueva”
      setTraces(ts.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)));
      // dominio
      const [inv_, met_, rep_] = await Promise.all([
        fetchSafe<InventoryItem[]>(`${API}/domain/inventory`).catch(() => []),
        fetchSafe<MetricItem[]>(`${API}/domain/metrics`).catch(() => []),
        fetchSafe<ReplenItem[]>(`${API}/domain/replenishments`).catch(() => []),
      ]);
      setInv(inv_);
      setMet(met_);
      setRep(rep_);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // primer load
    void refresh();
    const urlCID = sp.get('cid');
    if (urlCID) setCidQuery(urlCID);
  }, []); // eslint-disable-line

  // ===== acciones de dominio =====
  async function seedInventory() {
    const rows = invRows
      .map((r) => ({
        productId: r.productId.trim(),
        currentStock: Number(r.currentStock || 0),
      }))
      .filter((x) => x.productId);
    if (!rows.length) return;
    await fetchSafe(`${API}/domain/inventory/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: rows }),
    });
    clearInvRows();
    await refresh();
  }

  async function sendOrder() {
    setSubmitting(true);
    try {
      const payload = {
        eventType: 'OrderPlaced',
        priority: 'high' as const,
        orderId: ordId || crypto.randomUUID(),
        correlationId: ordCid || crypto.randomUUID(),
        items: ordRows
          .map((r) => ({
            productId: r.productId.trim(),
            quantity: Number(r.quantity || 0),
            unitPrice: Number(r.unitPrice || 0),
          }))
          .filter((x) => x.productId && x.quantity > 0),
      };
      const res = await fetch(`${API}/domain/order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`POST /domain/order => ${res.status} ${txt}`);
      }
      // badge con CID
      setCidBadge(payload.correlationId);
      // refresca datasets
      await refresh();
      // y ofrece “reproducir en vivo” directo
      const b64 = encodeURIComponent(jsonToB64(payload));
      router.push(`/visualizer?mode=auto&payload=${b64}`);
    } finally {
      setSubmitting(false);
    }
  }

  // abrir visualizer desde una fila de traza (por CID)
  function replayByCid(cid: string) {
    if (!cid) return;
    router.push(`/visualizer?mode=auto&cid=${encodeURIComponent(cid)}`);
  }

  // navegar a una traza desde el buscador
  async function goToTrace() {
    if (!cidQuery) return;
    await showTrace(cidQuery);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0b1220,rgba(11,18,32,0.92))] text-slate-100 px-4 md:px-6 pb-8">
      <TopNav title={<>Fanout &amp; SQS — Monitor</>}   />

      {/* Tabs */}
      <Tabs
        className="mt-4"
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as TabKey);
          if (v === 'overview') void refresh();
        }}
      >
        <div className='flex items-center justify-between mb-4 mt-10'>
          <TabsList className="bg-slate-900/60 border border-slate-800">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="messaging">Mensajería</TabsTrigger>
            <TabsTrigger value="storage">Almacenamiento</TabsTrigger>
            <TabsTrigger value="traces">Trazas</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            {/* buscador a la derecha */}
            <div className="ml-auto flex items-center gap-2">
              <input
                className={`${field} w-[260px]`}
                placeholder="🔎 Buscar Correlation ID…"
                value={cidQuery}
                onChange={(e) => setCidAndURL(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goToTrace()}
              />
              <Button variant="secondary" onClick={() => goToTrace()}>
                Ver
              </Button>
            </div>
          </div>
        </div>

        {/* ===== RESUMEN ===== */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Pedidos hoy', '—'],
              ['Eventos proc.', '—'],
              ['% errores', '—'],
              ['Ingresos', '—'],
            ].map(([k, v], i) => (
              <Card key={i} className="border-slate-800 bg-slate-900/50">
                <CardContent className="p-4">
                  <div className="text-slate-400 text-xs">{k}</div>
                  <div className="text-2xl font-semibold">{v}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Salud de colas */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">
                  Eventos en tránsito
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[40vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                    <tr>
                      <th className="text-left p-2">Queue</th>
                      <th className="text-center p-2">Ready</th>
                      <th className="text-center p-2">In-Flight</th>
                      <th className="text-center p-2">Delayed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queues.map((q) => (
                      <tr key={q.name} className="border-t border-slate-800">
                        <td className="p-2">
                          <code className="break-all">{q.name}</code>
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessages || 0}
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessagesNotVisible || 0}
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessagesDelayed || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Últimas trazas */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">Últimas trazas</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[40vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                    <tr>
                      <th className="text-left p-2">CorrelationId</th>
                      <th className="text-center p-2">Published</th>
                      <th className="text-center p-2">Route→F</th>
                      <th className="text-center p-2">Route→A</th>
                      <th className="text-center p-2">Recv F</th>
                      <th className="text-center p-2">Done F</th>
                      <th className="text-center p-2">Recv A</th>
                      <th className="text-center p-2">Done A</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {traces.slice(0, 25).map((t) => {
                      const routeF = t.routes ? true : t.f_recv || t.f_done;
                      const routeA = t.routes ? true : t.a_recv || t.a_done;
                      return (
                        <tr key={t.id} className="border-t border-slate-800">
                          <td className="p-2">
                            <code className="break-all">{t.id}</code>
                          </td>
                          <td className="text-center">{dot(t.published)}</td>
                          <td className="text-center">{dot(!!routeF)}</td>
                          <td className="text-center">{dot(!!routeA)}</td>
                          <td className="text-center">{dot(t.f_recv)}</td>
                          <td className="text-center">{dot(t.f_done)}</td>
                          <td className="text-center">{dot(t.a_recv)}</td>
                          <td className="text-center">{dot(t.a_done)}</td>
                          <td className="text-center">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="secondary"
                                className="h-8 px-3"
                                onClick={() => showTrace(t.id)}
                              >
                                Ver
                              </Button>
                              <Button
                                className="h-8 px-3"
                                onClick={() => replayByCid(t.id)}
                              >
                                Reproducir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Detalle debajo (como en el HTML original) */}
          <Card className="mt-4 border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-slate-200">Detalle de traza</CardTitle>
              <div className="flex items-center gap-2">
                <PlayButton parsed={parsed} />
                <Button variant="secondary" onClick={() => setDetail('')}>
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-auto">
              {detail ? (
                <TraceAccordion
                  detailHtml={detail}
                  cidToHighlight={cidQuery || cidBadge}
                />
              ) : (
                <em className="text-slate-400">Selecciona “Ver”.</em>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PEDIDOS ===== */}
        <TabsContent value="orders" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Crear pedido */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">Crear pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">
                      OrderId
                    </div>
                    <input
                      className={`${field} w-full`}
                      value={ordId}
                      onChange={(e) => setOrdId(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">
                      CorrelationId
                    </div>
                    <input
                      className={`${field} w-full`}
                      placeholder="auto si lo dejas vacío"
                      value={ordCid}
                      onChange={(e) => setOrdCid(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-slate-300 mb-2">Ítems de la orden</div>
                  <ul className="space-y-3">
                    {ordRows.map((r, i) => (
                      <li
                        key={i}
                        className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_44px] gap-2 items-end"
                      >
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">
                            Producto (productId)
                          </div>
                          <input
                            className={`${field} w-full`}
                            value={r.productId}
                            onChange={(e) =>
                              setOrdRows((rows) =>
                                rows.map((x, idx) =>
                                  idx === i
                                    ? { ...x, productId: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">
                            Cantidad
                          </div>
                          <input
                            className={`${field} w-full`}
                            type="number"
                            min={1}
                            value={r.quantity}
                            onChange={(e) =>
                              setOrdRows((rows) =>
                                rows.map((x, idx) =>
                                  idx === i
                                    ? { ...x, quantity: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">
                            Precio unitario
                          </div>
                          <input
                            className={`${field} w-full`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.unitPrice}
                            onChange={(e) =>
                              setOrdRows((rows) =>
                                rows.map((x, idx) =>
                                  idx === i
                                    ? { ...x, unitPrice: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                        </div>
                        <div className="flex md:justify-end">
                          <Button
                            variant="outline"
                            className="w-full md:w-11"
                            onClick={() => removeOrderRow(i)}
                          >
                            🗑
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center justify-between">
                    <Button variant="secondary" onClick={addOrderRow}>
                      + Ítem
                    </Button>
                    <div className="flex items-center gap-3">
                      {cidBadge && (
                        <div className="text-xs border border-slate-700 rounded-full px-3 py-1 bg-slate-900 flex items-center gap-2">
                          CID: <code>{cidBadge}</code>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                            onClick={() => copy(cidBadge)}
                          >
                            copiar
                          </Button>
                        </div>
                      )}
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void sendOrder();
                        }}
                        disabled={submitting}
                      >
                        {submitting ? 'Enviando…' : 'Enviar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventario — añadir productos */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">
                  Inventario — añadir productos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-3">
                  {invRows.map((r, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-1 md:grid-cols-[1fr_160px_44px] gap-2 items-end"
                    >
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">
                          Producto (productId)
                        </div>
                        <input
                          className={`${field} w-full`}
                          placeholder="p.ej. StartUp book"
                          value={r.productId}
                          onChange={(e) =>
                            setInvRows((rows) =>
                              rows.map((x, idx) =>
                                idx === i
                                  ? { ...x, productId: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">
                          Stock actual
                        </div>
                        <input
                          className={`${field} w-full`}
                          type="number"
                          min={0}
                          value={r.currentStock}
                          onChange={(e) =>
                            setInvRows((rows) =>
                              rows.map((x, idx) =>
                                idx === i
                                  ? { ...x, currentStock: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                      <div className="flex md:justify-end">
                        <Button
                          variant="outline"
                          className="w-full md:w-11"
                          onClick={() => removeInvRow(i)}
                        >
                          🗑
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={addInvRow}>
                      + Producto
                    </Button>
                    <Button variant="outline" onClick={clearInvRows}>
                      Limpiar
                    </Button>
                  </div>
                  <Button onClick={seedInventory}>Guardar</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inventario actual */}
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-200">
                Inventario — actual
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[48vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                  <tr>
                    <th className="text-left p-2">Producto</th>
                    <th className="text-center p-2">Stock</th>
                    <th className="text-center p-2">Reservado</th>
                    <th className="text-center p-2">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.map((x) => (
                    <tr key={x.productId} className="border-t border-slate-800">
                      <td className="p-2">
                        <code className="break-all text-slate-200">
                          {x.productId}
                        </code>
                      </td>
                      <td className="text-center">{x.currentStock}</td>
                      <td className="text-center">{x.reservedUnits}</td>
                      <td className="text-center">
                        {x.updatedAt
                          ? new Date(x.updatedAt).toLocaleTimeString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Métricas & Reposición */}
          <Card className="border-slate-800 bg-slate-900/50 xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-200">
                Métricas &amp; Reposición
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="max-h-[36vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                    <tr>
                      <th className="text-left p-2">Producto</th>
                      <th className="text-center p-2">Unidades</th>
                      <th className="text-center p-2">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {met.map((m) => (
                      <tr
                        key={m.productId}
                        className="border-t border-slate-800"
                      >
                        <td className="p-2">
                          <code className="break-all">{m.productId}</code>
                        </td>
                        <td className="text-center">{m.unitsSold}</td>
                        <td className="text-center">
                          ${(m.totalRevenue ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="max-h-[36vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                    <tr>
                      <th className="text-left p-2">Producto</th>
                      <th className="text-center p-2">Faltantes</th>
                      <th className="text-left p-2">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.map((r, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="p-2">
                          <code className="break-all">{r.productId}</code>
                        </td>
                        <td className="text-center">{r.missingUnits}</td>
                        <td className="p-2">
                          {r.orderId || ''}
                          {r.key ? (
                            <span className="opacity-60">
                              {' '}
                              / {r.key.split('/').pop()}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== MENSAJERÍA ===== */}
        <TabsContent value="messaging" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(600px,1fr)_420px] gap-4">
            {/* Colas SQS */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">Colas SQS</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[64vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/60 text-sky-300">
                    <tr>
                      <th className="text-left p-2">Queue</th>
                      <th className="text-center p-2">Ready</th>
                      <th className="text-center p-2">In-Flight</th>
                      <th className="text-center p-2">Delayed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queues.map((q) => (
                      <tr key={q.name} className="border-t border-slate-800">
                        <td className="p-2">
                          <code className="break-all">{q.name}</code>
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessages || 0}
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessagesNotVisible || 0}
                        </td>
                        <td className="text-center p-2">
                          {q.ApproximateNumberOfMessagesDelayed || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
              <CardFooter className="px-6 pb-4">
                <Button variant="secondary" onClick={() => refresh()}>
                  Refrescar
                </Button>
              </CardFooter>
            </Card>

            {/* Generador de eventos / simulación (puente a visualizer) */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">
                  Simulación &amp; Visualizer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-300">
                  Puedes crear pedidos desde la pestaña <b>Pedidos</b> y luego
                  “Reproducir” la traza (usa datos reales de tu backend). O
                  envía un payload directo:
                </p>
                <Button
                  onClick={() => {
                    const payload = {
                      eventType: 'OrderPlaced',
                      priority: 'high' as const,
                      orderId: crypto.randomUUID(),
                      correlationId: crypto.randomUUID(),
                      items: [
                        { productId: 'Demo', quantity: 1, unitPrice: 10 },
                      ],
                    };
                    const b64 = encodeURIComponent(jsonToB64(payload));
                    router.push(`/visualizer?mode=auto&payload=${b64}`);
                  }}
                >
                  Reproducir demo en Visualizer
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== ALMACENAMIENTO ===== */}
        <TabsContent value="storage" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">S3 — Orders</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-auto">
                {s3Orders.slice(0, 100).map((k) => (
                  <div key={k} className="break-all">
                    <a
                      className="underline"
                      href={`${API}/file?key=${encodeURIComponent(k)}`}
                      target="_blank"
                    >
                      {k}
                    </a>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">S3 — Analytics</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-auto">
                {s3Analytics.slice(0, 100).map((k) => (
                  <div key={k} className="break-all">
                    <a
                      className="underline"
                      href={`${API}/file?key=${encodeURIComponent(k)}`}
                      target="_blank"
                    >
                      {k}
                    </a>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== TRAZAS ===== */}
        <TabsContent value="traces" className="space-y-4">
          <Card className="mt-4 border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-slate-200">Detalle de traza</CardTitle>
              <div className="flex items-center gap-2">
                <PlayButton parsed={parsed} />
                <Button variant="secondary" onClick={() => setDetail('')}>
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-auto">
              {detail ? (
                <TraceAccordion
                  detailHtml={detail}
                  cidToHighlight={cidQuery || cidBadge}
                />
              ) : (
                <em className="text-slate-400">Selecciona “Ver”.</em>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
