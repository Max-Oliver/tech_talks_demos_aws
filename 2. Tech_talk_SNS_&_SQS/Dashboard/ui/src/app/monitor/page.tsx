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
import { traceJsonToHtml, TraceResponse } from '../helpers/TraceToJsonHtml';
import { TraceTimeline } from '../helpers/TraceTimline';
import { DlqMini } from '@/components/DlqMini';
import { cx } from '@/lib/cxColors';
import {
  Camera,
  ListFilterPlus,
  ListX,
  LucideArrowDownToDot,
  LucideRemoveFormatting,
} from 'lucide-react';

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

type InvItem = {
  productId: string;
  name: string;
  price: number;
  stock: number;
  reserved?: number;
  updatedAt?: number;
};

type MetricItem = {
  productId: string;
  unitsSold: number;
  totalRevenue?: number;
};

type TabKey = 'overview' | 'orders' | 'messaging' | 'storage' | 'traces';

type ReplenItem = {
  id?: string;
  productId: string;
  // para faltantes (cuando vendiste más de lo disponible):
  missingUnits?: number;
  missingQty?: number; // por compatibilidad
  orderId?: string;

  // para reposiciones (inventario_seed/manual)
  addedUnits?: number;
  type?: 'manual_restock' | 'new_product' | 'out_of_stock';
  reason?: string;
  t?: number;
  key?: string; // si incluyes el S3 key en el listado
};
// ===== styles =====
// estilos base
const noSpin =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
const inputBase =
  'h-10 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600/40';
const input = `${inputBase}`;
const inputNum = `${inputBase} ${noSpin}`;
const inputMoney = `${inputBase} pl-7 ${noSpin}`;
const label = 'text-slate-300 text-sm mb-1';
const help = 'text-xs text-slate-500';
const btnPrimary =
  'rounded-xl border border-sky-700 bg-sky-600/30 hover:bg-sky-600/40 px-4 h-10 text-sky-200 transition';
const btnGhost =
  'rounded-xl border border-transparent hover:bg-slate-800/60 px-4 h-10 text-slate-300 transition';
// ===== helpers =====
const field =
  'bg-slate-900/70 text-slate-100 placeholder:text-slate-500 border border-slate-800 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-slate-600';

export async function fetchSafe<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (!res.ok)
      throw new Error(`${init?.method || 'GET'} ${url} => ${res.status}`);
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

// ===== page =====
export default function MonitoringPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // global UI state
  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');
  const [loading, setLoading] = React.useState(false);
  const [qLoading, setQLoading] = React.useState(false);
  const [qLive, setQLive] = React.useState(false);

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

  // Se usa para el formulario de pedidos
  const [invDraft, setInvDraft] = React.useState<InvItem[]>([
    { productId: '001', name: 'StartUp book', price: 13, stock: 10 },
  ]);

  // Se usa para persistir el listado de inventario
  const [invList, setInvList] = React.useState<InvItem[]>([]); // ← persistido

  const clearInvRows = () =>
    setInvDraft([{ productId: '', name: '', price: 0, stock: 10 }]);

  const [met, setMet] = React.useState<MetricItem[]>([]);
  const [rep, setRep] = React.useState<ReplenItem[]>([]);

  const [bursting, setBursting] = React.useState(false);
  const [lastBurst, setLastBurst] = React.useState<number | null>(null);
  const [qChanged, setQChanged] = React.useState<Record<string, number>>({});
  const lastQueuesRef = React.useRef<QueueStat[]>([]);

  // parsed trace (para PlayButton)
  const parsed: ParsedTrace | null = React.useMemo(
    () => (detail ? parsedTraceFromHtml(detail) : null),
    [detail]
  );

  const refreshQueues = React.useCallback(async () => {
    setQLoading(true);
    try {
      const qs = await fetchSafe<QueueStat[]>(`${API}/queues`);
      const prev = lastQueuesRef.current;
      const changed: Record<string, number> = {};
      const sum = (q: QueueStat) =>
        (q.ApproximateNumberOfMessages || 0) +
        (q.ApproximateNumberOfMessagesNotVisible || 0) +
        (q.ApproximateNumberOfMessagesDelayed || 0);

      qs.forEach((q) => {
        const p = prev.find((x) => x.name === q.name);
        if (!p) return;
        if (sum(p) !== sum(q)) changed[q.name] = Date.now();
      });

      setQueues(qs);
      lastQueuesRef.current = qs;
      setQChanged(changed);
      window.setTimeout(() => setQChanged({}), 1200); // apaga el brillo
    } finally {
      setQLoading(false);
    }
  }, []);

  // activa/desactiva polling cada 1.5s
  React.useEffect(() => {
    if (!qLive) return;
    const id = window.setInterval(() => {
      void refreshQueues();
    }, 1500);
    return () => window.clearInterval(id);
  }, [qLive, refreshQueues]);

  // keep CID in URL so it survives tab switches
  const setCidAndURL = (v: string) => {
    setCidQuery(v);
    const url = new URL(location.href);
    if (v) url.searchParams.set('cid', v);
    else url.searchParams.delete('cid');
    history.replaceState(null, '', url.toString());
  };

  // load one trace by CID into accordion
  const showTrace = React.useCallback(
    async (cid: string) => {
      if (!cid) return;
      setActiveTab('traces');
      setCidAndURL(cid);
      setCidBadge(cid);
      try {
        // 👇 usa la ruta JSON del backend (NO /trace?cid=…)
        const data = await fetchSafe<TraceResponse>(
          `${API}/trace/${encodeURIComponent(cid)}`
        );
        setDetail(traceJsonToHtml(data)); // 👈 mantienes TraceAccordion sin tocar
      } catch (e) {
        console.log('Error loading trace for CID:', cid, e);
        setDetail(
          `<em style="color:#f88">No pude cargar la traza para ${cid}</em>`
        );
      }
    },
    [API]
  );

  // mostrar traza en panel de detalle (inline)
  const showTraceInline = React.useCallback(async (cid: string) => {
    if (!cid) return;
    setCidAndURL(cid);
    setCidBadge(cid);
    try {
      // si tu server devuelve JSON y lo conviertes a HTML, llama a tu helper; si ya devuelve HTML, usa directo
      // const dto = await fetchSafe<TraceDto>(`${API}/trace/${encodeURIComponent(cid)}`);
      // const html = traceJsonToHtml(dto);
      const html = await fetchSafe<string>(
        `${API}/trace/${encodeURIComponent(cid)}`
      ); // ← si ya devuelve HTML
      setDetail(html || '');
      // scroll suave al panel
      requestAnimationFrame(scrollToTrace);
    } catch {
      setDetail(
        `<em style="color:#f88">No pude cargar la traza para ${cid}</em>`
      );
      requestAnimationFrame(scrollToTrace);
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
        fetchSafe<InvItem[]>(`${API}/domain/inventory`).catch(() => []),
        fetchSafe<MetricItem[]>(`${API}/domain/metrics`).catch(() => []),
        fetchSafe<ReplenItem[]>(`${API}/domain/replenishments`).catch(() => []),
      ]);

      setInvList(inv_.map(normalizeInvItem));
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
    try {
      setSavingInv(true);

      // 👇 formateamos bien (nombre, id, precio, stock)
      const items = invDraft
        .map((r) => ({
          productId: String(r.productId || '').trim(),
          name: String(r.name || '').trim(),
          price: Number(r.price ?? 0),
          stock: Number.isFinite(Number(r.stock)) ? Number(r.stock) : 0,
          reserved: Number(r.reserved ?? 0),
          updatedAt: Date.now(),
        }))
        .filter((x) => x.productId && x.name);

      if (!items.length) return;

      await fetchSafe(`${API}/domain/inventory/seed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }), // ← payload nuevo
      });

      await loadInventory(); // refresca tabla/selector
      await reloadReplenishments();   // ⬅️ refresca el panel de “Métricas & Reposición”
      setInvDraft([{ productId: '', name: '', price: 0, stock: 10 }]); // resetear draft

      setSaveMsg('Guardado ✓');
      // opcional: dejar 1 fila vacía para seguir cargando
      // setInvDraft([{ productId: '', name: '', price: 0, stock: 10 }]);
      setTimeout(() => setSaveMsg(null), 1500);
    } finally {
      setSavingInv(false);
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

  const traceRef = React.useRef<HTMLDivElement>(null);
  const scrollToTrace = () =>
    traceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const detailHtml =
    typeof detail === 'string' ? detail : traceJsonToHtml(detail as any);

  // KPIS

  type QueueStat = {
    name: string;
    ApproximateNumberOfMessages?: number;
    ApproximateNumberOfMessagesNotVisible?: number;
    ApproximateNumberOfMessagesDelayed?: number;
  };

  const [metrics, setMetrics] = React.useState<{
    totalRevenue: number;
    products: number;
  } | null>(null);
  const [todayOrders, setTodayOrders] = React.useState<number>(0);

  async function loadSummary() {
    const [qs, ms, ts] = await Promise.all([
      fetchSafe<QueueStat[]>(`${API}/queues`),
      fetchSafe<any[]>(`${API}/domain/metrics`).catch(() => []),
      fetchSafe<any[]>(`${API}/traces`).catch(() => []),
    ]);
    setQueues(qs);
    const totalRev = ms.reduce((a, m) => a + Number(m.totalRevenue || 0), 0);
    setMetrics({ totalRevenue: totalRev, products: ms.length });

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const todayIds = ts.filter((t) => t.published).map((t) => t.id);
    // heurística: contamos published.json de hoy
    let count = 0;
    for (const id of todayIds) {
      const p = await fetchSafe<any>(`${API}/trace/${id}`);
      const step0 = p.steps?.find((s: any) =>
        s.key.endsWith('/00-published.json')
      );
      if (step0?.data?.t && step0.data.t >= today0.getTime()) count++;
    }
    setTodayOrders(count);
  }
  React.useEffect(() => {
    void loadSummary();
  }, []);

  // Metricas de Queue
  const readyTotal = queues
    .filter((q) => !q.name.endsWith('-dlq'))
    .reduce((a, q) => a + Number(q.ApproximateNumberOfMessages ?? 0), 0);

  const dlqTotal = queues
    .filter((q) => q.name.endsWith('-dlq'))
    .reduce((a, q) => a + Number(q.ApproximateNumberOfMessages ?? 0), 0);

  const totalMsgs = readyTotal + dlqTotal;
  const errPct = totalMsgs ? Math.round((dlqTotal / totalMsgs) * 100) : 0;

  const inflightTotal = queues.reduce(
    (a, q) => a + Number(q.ApproximateNumberOfMessagesNotVisible ?? 0),
    0
  );
  const delayedTotal = queues.reduce(
    (a, q) => a + Number(q.ApproximateNumberOfMessagesDelayed ?? 0),
    0
  );

  console.log('Total evnts: ', totalMsgs);
  console.log('Total Events Ready: ', readyTotal);
  console.log('Total DLQ Events: ', dlqTotal);

  const [orderNo, setOrderNo] = React.useState<string>('');
  const [corrNo, setCorrNo] = React.useState<string>('');
  const [sel, setSel] = React.useState<string>(''); // productId
  const [qty, setQty] = React.useState<number>(1);

  React.useEffect(() => {
    // IDs por defecto
    const rand = short(); // definí abajo
    setOrderNo(`001-${rand}`);
    setCorrNo(`001-${short()}`);
  }, []);
  function short() {
    return Math.random().toString(36).slice(2, 8);
  }
  const prod = invList.find((p) => p.productId === sel);
  const unit = Number(prod?.price ?? 0);
  const total = unit * qty;

  async function placeOrder() {
    if (!sel) return alert('Elegí un producto');
    const body = {
      orderId: orderNo || undefined,
      correlationId: corrNo || undefined,
      items: [{ productId: sel, quantity: qty }],
    };
    const response = await fetchSafe<any>(`${API}/domain/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.shortage > 0) {
      alert(
        `Se vendieron ${response.purchaseQty}, faltaron ${response.shortage}. Se creó reposición #${response.createdReplenishment?.id}.`
      );
    } else {
      alert(
        `Orden creada exitosamente! ✅ 
         Total $${response.total?.toFixed(2)} (${
          response.purchaseQty
        } x $${response.unitPrice.toFixed(2)})`
      );
    }
    // refrescar métricas y colas
    void loadSummary();
    await loadInventory()
    await reloadReplenishments()
    await refresh()
  }

  const reloadReplenishments = React.useCallback(async () => {
    const rep_ = await fetchSafe<ReplenItem[]>(
      `${API}/domain/replenishments`
    ).catch(() => []);
    setRep(rep_);
  }, []);

  // ==== Helpers para el CRUD en la grilla de "Añadir productos"
  const edit = React.useCallback((idx: number, patch: Partial<InvItem>) => {
    setInvDraft((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  }, []);

  const addRow = React.useCallback(() => {
    setInvDraft((prev) => [
      ...prev,
      { productId: '', name: '', price: 0, stock: 1 },
    ]);
  }, []);

  const removeRow = React.useCallback((idx: number) => {
    setInvDraft((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const isRowValid = (r: InvItem) =>
    r.name?.trim() &&
    r.productId?.trim() &&
    Number(r.price) >= 0 &&
    Number.isInteger(Number(r.stock)) &&
    Number(r.stock) >= 0;

  const timeAgo = (ms?: number) => {
    if (!ms) return '—';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  // helpers UI
  const cx = (...xs: (string | false | null | undefined)[]) =>
    xs.filter(Boolean).join(' ');
  const money = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
  };

  function normalizeInvItem(x: any): InvItem {
    return {
      productId: String(x.productId ?? x.product ?? ''),
      name: x.name ?? x.productId ?? 'Unnamed',
      price: x.price != null ? Number(x.price) : 0,
      stock: x.stock != null ? Number(x.stock) : Number(x.quantity ?? 0) || 0,
      reserved: Number(x.reserved ?? 0),
      updatedAt: x.updatedAt ? Number(x.updatedAt) : undefined,
    };
  }

  const [savingInv, setSavingInv] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);

  const loadInventory = React.useCallback(async () => {
    const raw = await fetchSafe<any[]>(`${API}/domain/inventory`);
    setInvList(raw.map(normalizeInvItem));
  }, []);

  React.useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0b1220,rgba(11,18,32,0.92))] text-slate-100 px-4 md:px-6 pb-8">
      <TopNav title={<>Fanout &amp; SQS — Monitor</>} />

      {/* Tabs */}
      <Tabs
        className="mt-4"
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as TabKey);
          if (v === 'overview') void refresh();
        }}
      >
        <div className="flex items-center justify-between mb-4 mt-10">
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
              ['Pedidos hoy', todayOrders],
              ['Eventos proc.', totalMsgs],
              ['% errores', `${errPct}%`],
              [
                'Ingresos',
                metrics ? `$${metrics.totalRevenue.toFixed(2)}` : '—',
              ],
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
                    {queues.map((q) => {
                      const isFocus = /^(demo-thr|demo-thr-dlq)$/i.test(q.name); // 💙 objetivo
                      const changed = !!qChanged[q.name];
                      return (
                        <tr
                          key={q.name}
                          className={cx(
                            'border-t border-slate-800 transition',
                            isFocus && 'bg-sky-950/20', // fondo azulado
                            changed && 'animate-pulse ring-1 ring-sky-500/40' // pulso cuando cambian números
                          )}
                        >
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
                      );
                    })}
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
                      <th className="text-center p-2">Route→Ful</th>
                      <th className="text-center p-2">Route→Met</th>
                      <th className="text-center p-2">Recv Ful</th>
                      <th className="text-center p-2">Done Ful</th>
                      <th className="text-center p-2">Recv Met</th>
                      <th className="text-center p-2">Done Met</th>
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
                                onClick={() => showTraceInline(t.id)}
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
          <Card
            id="trace-detail"
            ref={traceRef}
            className="mt-4 border-slate-800 bg-slate-900/50"
          >
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
                <>
                  <TraceTimeline detailHtml={detailHtml} />
                  <TraceAccordion
                    detailHtml={detail}
                    cidToHighlight={cidQuery || cidBadge}
                  />
                </>
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
                <div>
                  <label className="text-slate-300">Producto</label>
                  <select
                    className={input}
                    value={sel}
                    onChange={(e) => setSel(e.target.value)}
                  >
                    <option value="">— Elegir —</option>
                    {invList.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.name ?? p.productId} — {money(p.price)} (stock{' '}
                        {p.stock ?? 0})
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-slate-300">Cantidad</label>
                      <input
                        type="number"
                        className={input}
                        value={qty}
                        min={1}
                        onChange={(e) =>
                          setQty(Math.max(1, Number(e.target.value || 1)))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-slate-300">Precio unitario</label>
                      <div className="h-10 flex items-center px-3 rounded border border-slate-700 bg-slate-800">
                        {unit ? `$${unit.toFixed(2)}` : '—'}
                      </div>
                    </div>
                    <div>
                      <label className="text-slate-300">Total</label>
                      <div className="h-10 flex items-center px-3 rounded border border-slate-700 bg-slate-800 font-semibold">
                        {unit ? `$${total.toFixed(2)}` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="text-slate-300">OrderId</label>
                      <input
                        className={input}
                        value={orderNo}
                        onChange={(e) => setOrderNo(e.target.value)}
                        placeholder="001-uuid"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300">CorrelationId</label>
                      <input
                        className={input}
                        value={corrNo}
                        onChange={(e) => setCorrNo(e.target.value)}
                        placeholder="001-uuid"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    {cidBadge && (
                      <div className="text-xs border border-slate-700 rounded-full px-3 py-1 bg-slate-900 flex items-center gap-2">
                        CID: <code>{cidBadge}</code>
                        <Button
                          size="sm"
                          variant="outline"
                          className={btnGhost}
                          onClick={() => copy(cidBadge)}
                        >
                          copiar
                        </Button>
                      </div>
                    )}
                    <Button
                      type="button"
                      className={btnPrimary}
                      onClick={() => void placeOrder()}
                      disabled={submitting || !sel}
                    >
                      {submitting ? 'Creando…' : 'Crear pedido'}
                    </Button>
                    <Button className={btnGhost} onClick={clearInvRows}>
                      🗑️ Limpiar
                    </Button>
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
                <div className="space-y-4">
                  {invDraft.map((row, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 md:grid-cols-4 gap-3"
                    >
                      <div>
                        <div className={label}>Nombre</div>
                        <input
                          className={input}
                          placeholder="StartUp book"
                          value={row.name}
                          onChange={(e) => edit(i, { name: e.target.value })}
                        />
                        <div className={help}>Nombre del producto</div>
                      </div>

                      <div>
                        <div className={label}>ID (productId)</div>
                        <input
                          className={input}
                          placeholder="Product ID único"
                          value={row.productId}
                          onChange={(e) =>
                            edit(i, { productId: e.target.value })
                          }
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                        <div className={help}>
                          Clave única (se usa en órdenes y métricas).
                        </div>
                      </div>

                      <div>
                        <div className={label}>Precio</div>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                            $
                          </span>
                          <input
                            className={inputMoney}
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.price}
                            onChange={(e) =>
                              edit(i, { price: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div className={help}>
                          Precio unitario (decimales permitidos).
                        </div>
                      </div>

                      <div>
                        <div className={label}>Stock</div>
                        <input
                          className={inputNum}
                          type="number"
                          inputMode="numeric"
                          step="1"
                          min="0"
                          placeholder="10"
                          value={row.stock}
                          onChange={(e) =>
                            edit(i, {
                              stock: Math.max(
                                0,
                                Math.trunc(Number(e.target.value) || 0)
                              ),
                            })
                          }
                        />
                        <div className={help}>
                          Unidades disponibles (entero).
                        </div>
                      </div>

                      <div className="md:col-span-4 flex justify-end">
                        <Button
                          className={btnGhost}
                          onClick={() => removeRow(i)}
                        >
                          <ListX color="red" size={48} /> Remove item
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <Button className={btnGhost} onClick={addRow}>
                      <ListFilterPlus color="#3f7ad9" size={48} /> Producto
                    </Button>
                    <Button className={btnGhost} onClick={clearInvRows}>
                      Limpiar
                    </Button>
                    <Button
                      className={btnPrimary}
                      onClick={seedInventory}
                      disabled={savingInv || !invDraft.every(isRowValid)}
                    >
                      {savingInv ? 'Guardando…' : saveMsg ?? 'Guardar'}
                    </Button>
                  </div>
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
                <thead className="sticky top-0 bg-slate-900/70 backdrop-blur text-sky-300 border-b border-slate-800">
                  <tr>
                    <th className="text-left p-2">Producto</th>
                    <th className="text-left p-2">ID</th>
                    <th className="text-center p-2">Precio</th>
                    <th className="text-center p-2">Stock</th>
                    <th className="text-center p-2">Reservado</th>
                    <th className="text-center p-2">Actualizado</th>
                  </tr>
                </thead>

                <tbody>
                  {invList.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-6 text-center text-slate-400"
                      >
                        Sin productos en inventario.
                      </td>
                    </tr>
                  )}

                  {[...invList]
                    .sort((a: InvItem, b: InvItem) =>
                      (a.name || a.productId).localeCompare(
                        b.name || b.productId
                      )
                    )
                    .map((x: InvItem) => {
                      const low = (x.stock ?? 0) <= 3;
                      return (
                        <tr
                          key={x.productId}
                          className={cx(
                            'border-t border-slate-800 transition-colors',
                            low && 'bg-sky-950/20'
                          )}
                        >
                          <td className="p-2 text-slate-200">
                            {x.name || x.productId}
                          </td>
                          <td className="p-2">
                            <code className="break-all text-slate-400">
                              {x.productId}
                            </code>
                          </td>
                          <td className="text-center p-2 text-slate-200">
                            {money(x.price)}
                          </td>
                          <td
                            className={cx(
                              'text-center p-2 font-medium',
                              low ? 'text-sky-300' : 'text-slate-200'
                            )}
                            title={low ? 'Stock bajo' : undefined}
                          >
                            {x.stock ?? 0}
                          </td>
                          <td className="text-center p-2 text-slate-300">
                            {
                              x.reserved ??
                                0 /* <- corregido (antes 'resered') */
                            }
                          </td>
                          <td
                            className="text-center p-2 text-slate-300"
                            title={
                              x.updatedAt
                                ? new Date(x.updatedAt).toLocaleString()
                                : ''
                            }
                          >
                            {timeAgo(x.updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
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
                      <th className="text-center p-2">
                        Faltantes / Reposición
                      </th>
                      <th className="text-left p-2">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rep]
                      .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
                      .map((r, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          <td className="p-2">
                            <code className="break-all">{r.productId}</code>
                            {/* opcional: mostrar tipo */}
                            {r.type ? (
                              <span className="ml-2 text-xs text-slate-400">
                                ({String(r.type).replaceAll('_', ' ')})
                              </span>
                            ) : null}
                          </td>

                          {/* ⬇️ AQUÍ el cambio */}
                          <td className="text-center">
                            {(() => {
                              const added = (r as any).addedUnits;
                              const miss =
                                r.missingUnits ?? (r as any).missingQty ?? 0;
                              if (added != null && Number(added) > 0) {
                                return (
                                  <span className="text-emerald-300 font-medium">
                                    +{added}
                                  </span>
                                );
                              }
                              return miss;
                            })()}
                          </td>

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
                    {queues.map((q) => {
                      const isFocus = /^(demo-thr|demo-thr-dlq)$/i.test(q.name); // 💙 objetivo
                      const changed = !!qChanged[q.name];
                      return (
                        <tr
                          key={q.name}
                          className={cx(
                            'border-t border-slate-800 transition',
                            isFocus && 'bg-sky-950/20', // fondo azulado
                            changed && 'animate-pulse ring-1 ring-sky-500/40' // pulso cuando cambian números
                          )}
                        >
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
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
              <CardFooter className="px-6 pb-4 flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => refreshQueues()}
                  disabled={qLoading}
                >
                  {qLoading ? 'Actualizando…' : 'Refrescar'}
                </Button>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qLive}
                    onChange={(e) => setQLive(e.target.checked)}
                  />
                  Live (1.5s)
                </label>
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

                <Button
                  variant="outline"
                  onClick={async () => {
                    setBursting(true);
                    try {
                      const r = await fetchSafe<{ ok: boolean; sent: number }>(
                        `${API}/throttle/burst`,
                        {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ count: 120 }),
                        }
                      );
                      setLastBurst(r?.sent ?? 120);
                      setQLive(true); // 🔴 activa live para que lo veas moverse
                      await refreshQueues(); // pulso inicial inmediato
                    } finally {
                      setBursting(false);
                    }
                  }}
                  disabled={bursting}
                >
                  {bursting
                    ? 'Enviando burst…'
                    : 'Stress test (throttling → DLQ)'}
                </Button>

                {lastBurst ? (
                  <div className="text-xs text-slate-400 mt-2">
                    Enviados {lastBurst} a <code>demo-thr</code>. Observa en{' '}
                    <b>Colas SQS</b>:
                    <ul className="list-disc ml-5">
                      <li>
                        Sube <code>demo-thr</code> (Ready).
                      </li>
                      <li>
                        Con concurrency=1 y VisibilityTimeout=6s, tras ~20–30s
                        verás crecer <code>demo-thr-dlq</code>.
                      </li>
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* DLQ — inspección y reintento */}
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-200">
                  DLQ — inspección
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DlqMini />
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
                <>
                  <TraceTimeline detailHtml={detail} />
                  <TraceAccordion
                    detailHtml={detail}
                    cidToHighlight={cidQuery || cidBadge}
                  />
                </>
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
