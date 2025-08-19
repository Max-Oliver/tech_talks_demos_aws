/* eslint-disable @typescript-eslint/no-explicit-any */
// app/visualizer/page.tsx
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchPublishedPayloadByCid } from '@/app/helpers/VisualizerBridge';

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { TopNav } from '@/components/TopNav';
import { API, fetchSafe } from '../monitor/page';

const cn = (...xs: (string | false | null | undefined)[]) =>
  xs.filter(Boolean).join(' ');

// ===== Tipos
export type WorkerKey = 'pagos' | 'inv' | 'ship';
export type FlowState =
  | 'IDLE'
  | 'EVENT_PUBLISHED'
  | 'FANOUT'
  | 'DELIVERED_TO_QUEUES'
  | 'PROCESSING'
  | 'DONE'
  | 'FAILED';
export type QueueStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'DONE'
  | 'FAILED'
  | 'DLQ';
type LogItem = { t: string; msg: string };

type RunConfig = { auto: boolean; speedMs: number; failOne?: WorkerKey | null };
type Snap = {
  state: FlowState;
  queues: Record<WorkerKey, QueueStatus>;
  log: LogItem[];
};

type FailMode = 'none' | 'pagos' | 'inv' | 'ship' | 'all';
type BuildOpts = {
  failMode?: FailMode;
  randomEnabled?: boolean;
  randomRate?: number;
  redriveToDlq?: boolean;
};

type OrderItem = { sku: string; qty: number };
export type OrderCreatedPayload = {
  eventType: 'OrderCreated';
  eventId: string;
  tenantId: string;
  schemaVersion: number;
  msgStatus: string;
  msgType: string;
  data: {
    orderId: string;
    customerId: string;
    total: number;
    currency: string;
    items: OrderItem[];
    createdAt: string;
  };
};

// ===== Helpers base64 (si los querés, podés usarlos desde JsonConverter)
function b64ToJson<T = unknown>(b64: string): T {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as T;
  } catch {
    return {} as T;
  }
}

// ===== Componente
export default function FanoutVisualizer() {
  const searchParams = useSearchParams();

  // payload visto en sidebar
  const [payload, setPayload] = React.useState<any | null>(null);
  const payloadRef = React.useRef<any | null>(null);

  // UI de canvas
  const [state, setState] = React.useState<FlowState>('IDLE');
  const [queues, setQueues] = React.useState<Record<WorkerKey, QueueStatus>>({
    pagos: 'PENDING',
    inv: 'PENDING',
    ship: 'PENDING',
  });
  const [log, setLog] = React.useState<LogItem[]>([]);

  // secuencia de snapshots
  const [snaps, setSnaps] = React.useState<Snap[]>([]);
  const [cursor, setCursor] = React.useState(0);
  const snapsRef = React.useRef<Snap[]>([]);
  React.useEffect(() => {
    snapsRef.current = snaps;
  }, [snaps]);
  const snap = snaps[cursor];

  // controles
  const [run, setRun] = React.useState<RunConfig>({
    auto: false,
    speedMs: 850,
    failOne: null,
  });
  const runRef = React.useRef(run);
  React.useEffect(() => {
    runRef.current = run;
  }, [run]);

  // toggles de fallas
  const [forceDlq, setForceDlq] = React.useState<FailMode>('none');
  const [enableRandomFailures, setEnableRandomFailures] = React.useState(false);
  const [randomFailRate, setRandomFailRate] = React.useState(0.15);
  const [routeFailsToDLQ, setRouteFailsToDLQ] = React.useState(false);

  // ---- payload por defecto (sólo cliente) ----
  function buildDefaultPayload(): OrderCreatedPayload {
    return {
      eventType: 'OrderCreated',
      eventId: cryptoId(),
      tenantId: 'acme',
      schemaVersion: 1,
      msgStatus: 'NEW',
      msgType: 'domain',
      data: {
        orderId: `ORD-${Math.floor(Math.random() * 9999)}`,
        customerId: 'CUS-1029',
        total: 149.9,
        currency: 'USD',
        items: [
          { sku: 'SKU-BOOK-1', qty: 1 },
          { sku: 'SKU-MUG-2', qty: 2 },
        ],
        createdAt: new Date().toISOString(),
      },
    };
  }

  // aplicar snapshot → actualiza UI + log
  const applySnap = React.useCallback((s: Snap) => {
    setState(s.state);
    setQueues(s.queues);
    setLog(s.log ?? []);
  }, []);

  // seed inicial sin cid/payload en URL (evita hydration issues)
  React.useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const hasPayload = !!sp.get('payload');
    const hasCid = !!sp.get('cid');
    if (!hasPayload && !hasCid) {
      const p = buildDefaultPayload();
      payloadRef.current = p;
      setPayload(p);
      const seq = buildSnapshots(p, 'none');
      setSnaps(seq);
      setCursor(0);
      applySnap(seq[0]);
      setLog([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // escucha cambios de URL (?payload o ?cid) → replay
  React.useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const payloadB64 = sp.get('payload');
    const cid = sp.get('cid') || undefined;
    const mode = (sp.get('mode') ?? 'auto') as 'auto' | 'step';
    const speed = Number(sp.get('speed') ?? '') || undefined;
    const force = (sp.get('forceDlq') as FailMode) ?? 'none';

    hardReset({ keepPayload: false });

    async function go() {
      if (payloadB64) {
        const p = b64ToJson<any>(payloadB64);
        startReplay({ payload: p, speedMs: speed, auto: mode === 'auto' });
        return;
      }
      if (cid) {
        const p = await fetchPublishedPayloadByCid(cid);
        if (p)
          startReplay({ payload: p, speedMs: speed, auto: mode === 'auto' });
      }
      setForceDlq(force);
    }
    void go();
  }, [searchParams.toString()]);

  // auto-step loop
  const canStep = cursor < snaps.length - 1;
  const stepNext = React.useCallback(() => {
    setCursor((prev) => {
      const arr = snapsRef.current;
      const next = Math.min(prev + 1, arr.length - 1);
      if (next !== prev) applySnap(arr[next]);
      return next;
    });
  }, [applySnap]);

  function stepPrev() {
    if (cursor === 0) return;
    setCursor((c) => c - 1);
    const arr = snapsRef.current;
    const prevSnap = arr[Math.max(0, cursor - 1)];
    if (prevSnap) applySnap(prevSnap);
  }

  React.useEffect(() => {
    if (!run.auto || !canStep) return;
    const id = window.setTimeout(
      () => stepNext(),
      Math.max(120, run.speedMs || 400)
    );
    return () => clearTimeout(id);
  }, [run.auto, run.speedMs, cursor, canStep, stepNext, snaps.length]);

  // reset fuerte
  function hardReset(opts?: { keepPayload?: boolean }) {
    const base =
      opts?.keepPayload && payloadRef.current
        ? payloadRef.current
        : buildDefaultPayload();
    payloadRef.current = base;
    setPayload(base);

    const first: Snap = {
      state: 'IDLE',
      queues: { pagos: 'PENDING', inv: 'PENDING', ship: 'PENDING' },
      log: [],
    };
    setSnaps([first]);
    setCursor(0);
    applySnap(first);
    setLog([]);
    setRun((r) => ({ ...r, auto: false, failOne: null }));
  }

  // asegurar secuencia cuando prendo Auto
  function ensureSequenceAndMaybeAuto(auto = false) {
    if (snapsRef.current.length > 1) {
      if (auto) setRun((r) => ({ ...r, auto: true }));
      return;
    }
    const p = payloadRef.current ?? buildDefaultPayload();
    payloadRef.current ?? setPayload(p);

    const seq = buildSnapshots(p, {
      failMode: forceDlq,
      randomEnabled: enableRandomFailures,
      randomRate: randomFailRate,
      redriveToDlq: routeFailsToDLQ,
    });

    setSnaps(seq);
    setCursor(0);
    applySnap(seq[0]);
    if (auto && seq.length > 1) {
      setRun((r) => ({ ...r, auto: true }));
      requestAnimationFrame(() => {
        setCursor(1);
        applySnap(seq[1]);
      });
    }
  }

  // iniciar replay con payload externo
  function startReplay(opts: {
    payload: any;
    speedMs?: number;
    auto?: boolean;
  }) {
    payloadRef.current = opts.payload;
    setPayload(opts.payload);
    const seq = buildSnapshots(opts.payload, {
      failMode: forceDlq,
      randomEnabled: enableRandomFailures,
      randomRate: randomFailRate,
      redriveToDlq: routeFailsToDLQ,
    });
    setSnaps(seq);
    setCursor(0);
    applySnap(seq[0]);
    setLog([]);
    setRun((r) => ({
      ...r,
      speedMs: opts.speedMs ?? r.speedMs,
      auto: !!opts.auto,
    }));
    if (opts.auto && seq.length > 1) {
      requestAnimationFrame(() => {
        setCursor(1);
        applySnap(seq[1]);
      });
    }
  }

  // buildSnapshots (compat firma vieja y nueva)
  function buildSnapshots(
    payload: any,
    config?: FailMode | BuildOpts | null
  ): Snap[] {
    let failMode: FailMode = 'none';
    let randomEnabled = false;
    let randomRate = 0;
    let redriveToDlq = false;

    if (config == null) {
      // defaults
    } else if (typeof config === 'string') {
      failMode = config as FailMode;
    } else {
      failMode = (config.failMode ?? 'none') as FailMode;
      randomEnabled = !!config.randomEnabled;
      randomRate = config.randomRate ?? 0;
      redriveToDlq = !!config.redriveToDlq;
    }

    const seq: Snap[] = [];
    const baseQueues: Record<WorkerKey, QueueStatus> = {
      pagos: 'PENDING',
      inv: 'PENDING',
      ship: 'PENDING',
    };
    let l: LogItem[] = [];
    const add = (s: Omit<Snap, 'log'>, msg?: string) => {
      if (msg) l = [{ t: stamp(), msg }, ...l].slice(0, 120);
      seq.push({ ...s, log: l });
    };
    const resolve = (k: WorkerKey): QueueStatus => {
      if (failMode === 'all' || failMode === k) return 'DLQ';
      if (randomEnabled && Math.random() < randomRate)
        return redriveToDlq ? 'DLQ' : 'FAILED';
      return 'DONE';
    };

    add({ state: 'IDLE', queues: { ...baseQueues } });
    add(
      { state: 'EVENT_PUBLISHED', queues: { ...baseQueues } },
      'Producer publicó OrderCreated en SNS Topic'
    );
    add(
      { state: 'FANOUT', queues: { ...baseQueues } },
      'SNS Topic fanout → entrega a 3 suscriptores (SQS)'
    );
    add(
      {
        state: 'DELIVERED_TO_QUEUES',
        queues: { pagos: 'RECEIVED', inv: 'RECEIVED', ship: 'RECEIVED' },
      },
      'SQS-Pagos, SQS-Inv y SQS-Ship recibieron el mensaje'
    );
    add(
      {
        state: 'PROCESSING',
        queues: { pagos: 'PROCESSING', inv: 'PROCESSING', ship: 'PROCESSING' },
      },
      'Workers comienzan a procesar'
    );
    add(
      {
        state: 'DONE',
        queues: {
          pagos: resolve('pagos'),
          inv: resolve('inv'),
          ship: resolve('ship'),
        },
      },
      'Workers terminaron: actualización de estados'
    );

    return seq;
  }

  // UI helpers
  const stateBadge = (s: FlowState) => {
    const look: Record<
      FlowState,
      {
        txt: string;
        variant: 'default' | 'secondary' | 'outline' | 'destructive';
      }
    > = {
      IDLE: { txt: 'IDLE', variant: 'secondary' },
      EVENT_PUBLISHED: { txt: 'EVENT_PUBLISHED', variant: 'default' },
      FANOUT: { txt: 'FANOUT', variant: 'default' },
      DELIVERED_TO_QUEUES: { txt: 'DELIVERED_TO_QUEUES', variant: 'outline' },
      PROCESSING: { txt: 'PROCESSING', variant: 'default' },
      DONE: { txt: 'DONE', variant: 'secondary' },
      FAILED: { txt: 'FAILED', variant: 'destructive' },
    };
    const v = look[s];
    return <Badge variant={v.variant}>{v.txt}</Badge>;
  };

  const qColor = (q: QueueStatus) =>
    q === 'PENDING'
      ? 'border-slate-700'
      : q === 'RECEIVED'
      ? 'border-blue-500'
      : q === 'PROCESSING'
      ? 'border-amber-500'
      : q === 'DONE'
      ? 'border-emerald-500'
      : q === 'FAILED'
      ? 'border-red-500'
      : 'border-pink-500';

  const stamp = () =>
    new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  // ===== Render
  return (
    <div className="flex flex-col h-full">
      <TopNav
        title="SNS → SQS Fanout Visualizer"
        state={state}
        queues={queues}
      />

      {/* Canvas y sidebar */}
      <div className="fixed inset-0 overflow-hidden">
        <style>{keyframes}</style>

        <Card className="h-full w-full rounded-none border-0 bg-[linear-gradient(180deg,#0b1220,rgba(11,18,32,0.85))]">
          <CardHeader className="pb-3 sticky top-0 z-10 bg-transparent">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6">
              <CardTitle className="text-slate-100">
                SNS → SQS Fanout Visualizer{' '}
                <span className="text-slate-400 text-sm ml-3">
                  demo en vivo
                </span>
              </CardTitle>
              <div className="flex justify-between">{stateBadge(state)}</div>
              <TopNav title="" state={state} queues={queues} />
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-[minmax(0,1fr)_420px] gap-4 h-[calc(100vh-72px)] px-4 md:px-6 pb-6">
            {/* Canvas */}
            <div>
              <div
                className="relative overflow-hidden rounded-lg border border-slate-800 p-4 h-full
               bg-[linear-gradient(180deg,#0b1220,rgba(11,18,32,0.92))]
               before:pointer-events-none before:absolute before:inset-0
               before:bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.08),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.08),transparent_35%)]"
              >
                {/* Nodos */}
                <Node
                  title="Producer"
                  subtitle={
                    payload
                      ? `OrderId: ${(payload.data?.orderId ?? '')
                          .toString()
                          .slice(0, 8)}…`
                      : 'API / Lambda'
                  }
                  x="12%"
                  y="20%"
                  active={state !== 'IDLE'}
                  badge={state === 'IDLE' ? 'READY' : 'FIRED'}
                />
                <Node
                  title="SNS Topic"
                  subtitle="Event Bus"
                  x="36%"
                  y="20%"
                  active={state !== 'IDLE'}
                  badge={
                    state === 'EVENT_PUBLISHED' || state === 'FANOUT'
                      ? 'PUBLISH'
                      : 'IDLE'
                  }
                />

                <Node
                  title="SQS-Pagos"
                  subtitle={humanQueue(queues.pagos)}
                  x="70%"
                  y="12%"
                  ring={qColor(queues.pagos)}
                  badge={queues.pagos}
                />
                <Node
                  title="SQS-Inv"
                  subtitle={humanQueue(queues.inv)}
                  x="70%"
                  y="42%"
                  ring={qColor(queues.inv)}
                  badge={queues.inv}
                />
                <Node
                  title="SQS-Ship"
                  subtitle={humanQueue(queues.ship)}
                  x="71%"
                  y="72%"
                  ring={qColor(queues.ship)}
                  badge={queues.ship}
                />
                <Node
                  title="DLQ"
                  subtitle="Dead-Letter Queue"
                  x="90%"
                  y="88%"
                  ring="border-pink-500"
                  badge="DLQ"
                />

                {/* Edges */}
                <Edge
                  from={{ x: '19%', y: '20%' }}
                  to={{ x: '28%', y: '20%' }}
                  active={state === 'EVENT_PUBLISHED' || state === 'FANOUT'}
                  label="publish"
                />

                <EdgeHV
                  from={{ x: '44%', y: '20%' }}
                  to={{ x: '62%', y: '12%' }}
                  midX="58%"
                  active={state === 'FANOUT' || state === 'DELIVERED_TO_QUEUES'}
                  label="deliver"
                />
                <EdgeHV
                  from={{ x: '44%', y: '20%' }}
                  to={{ x: '62%', y: '42%' }}
                  midX="58%"
                  active={state === 'FANOUT' || state === 'DELIVERED_TO_QUEUES'}
                />
                <EdgeHV
                  from={{ x: '44%', y: '20%' }}
                  to={{ x: '63%', y: '72%' }}
                  midX="58%"
                  active={state === 'FANOUT' || state === 'DELIVERED_TO_QUEUES'}
                />

                {/* Queues → DLQ */}
                {queues.pagos === 'DLQ' && (
                  <EdgeHV
                    from={{ x: '78%', y: '12%' }}
                    to={{ x: '90%', y: '84%' }}
                    midX="84%"
                    label="To DLQ"
                    active
                  />
                )}
                {queues.inv === 'DLQ' && (
                  <EdgeHV
                    from={{ x: '78%', y: '42%' }}
                    to={{ x: '90%', y: '84%' }}
                    midX="86%"
                    label="To DLQ"
                    active
                  />
                )}
                {queues.ship === 'DLQ' && (
                  <EdgeHV
                    from={{ x: '77%', y: '72%' }}
                    to={{ x: '90%', y: '84%' }}
                    midX="88%"
                    label="To DLQ"
                    active
                  />
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="h-full overflow-auto space-y-4">
              <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-300">
                    Controles
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (run.auto) setRun((r) => ({ ...r, auto: false }));
                        else ensureSequenceAndMaybeAuto(true);
                      }}
                    >
                      {run.auto ? '⏸️ Auto' : '▶️ Auto'}
                    </Button>
                    <Button onClick={stepNext}>⏭️ Step</Button>
                    <Button onClick={stepPrev} disabled={cursor === 0}>
                      ⏮️ Atrás
                    </Button>
                    <Button onClick={() => hardReset({ keepPayload: true })}>
                      🔄 Reset
                    </Button>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400 mb-1">Velocidad</div>
                    <Slider
                      defaultValue={[run.speedMs]}
                      min={250}
                      max={2000}
                      step={50}
                      onValueChange={(v) =>
                        setRun((r) => ({ ...r, speedMs: v[0] ?? r.speedMs }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-slate-400 mr-2">
                      Forzar DLQ:
                    </div>
                    {(['none', 'pagos', 'inv', 'ship', 'all'] as const).map(
                      (v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant={forceDlq === v ? 'default' : 'outline'}
                          onClick={() => setForceDlq(v)}
                        >
                          {v === 'none' ? 'ninguna' : v.toUpperCase()}
                        </Button>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                    <input
                      id="route-failed"
                      type="checkbox"
                      checked={routeFailsToDLQ}
                      onChange={(e) => setRouteFailsToDLQ(e.target.checked)}
                    />
                    <label htmlFor="route-failed" className="cursor-pointer">
                      Enviar FAILED a DLQ (simular redrive)
                    </label>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                    <input
                      id="rand-fails"
                      type="checkbox"
                      checked={enableRandomFailures}
                      onChange={(e) =>
                        setEnableRandomFailures(e.target.checked)
                      }
                    />
                    <label htmlFor="rand-fails" className="cursor-pointer">
                      Habilitar fallos aleatorios
                    </label>
                    {enableRandomFailures && (
                      <>
                        <span className="ml-2">Tasa:</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={Math.round(randomFailRate * 100)}
                          onChange={(e) =>
                            setRandomFailRate(Number(e.target.value) / 100)
                          }
                        />
                        <span className="tabular-nums w-10 text-right">
                          {Math.round(randomFailRate * 100)}%
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-300">
                    Payload
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre
                    className="text-xs leading-relaxed text-slate-300 overflow-auto max-h-64"
                    suppressHydrationWarning
                  >
                    {JSON.stringify(payload ?? {}, null, 2)}
                  </pre>
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-300">Log</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-auto">
                  <ul className="space-y-2">
                    {log.length === 0 && (
                      <li className="text-xs text-slate-500">
                        Sin eventos aún. Presiona Auto o Step.
                      </li>
                    )}
                    {log.map((l, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        <span className="text-slate-500">{l.t}</span> — {l.msg}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter />
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== Subcomponentes (Node / Edge / EdgeHV)
function Node(props: {
  title: string;
  subtitle?: string;
  x: string;
  y: string;
  active?: boolean;
  ring?: string;
  badge?: string | QueueStatus;
}) {
  const { title, subtitle, x, y, active, ring, badge } = props;
  return (
    <div
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 min-w-[170px] rounded-lg border bg-slate-900/70 px-3 py-2',
        ring ? ring : 'border-slate-700',
        active && 'shadow-[0_0_0_2px_rgba(99,102,241,0.2)]'
      )}
      style={{ left: x, top: y }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-100 text-sm font-medium">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-slate-400">{subtitle}</div>
          )}
        </div>
        {badge && (
          <span
            className={cn(
              'text-[10px] px-2 py-[2px] rounded-full border',
              typeof badge === 'string' && badge.toUpperCase() === 'DLQ'
                ? 'bg-pink-500/10 text-pink-300 border-pink-500/30'
                : badge === 'FAILED'
                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                : badge === 'DONE'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : badge === 'PROCESSING'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : badge === 'RECEIVED'
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                : 'bg-slate-800/60 text-slate-300 border-slate-700'
            )}
          >
            {String(badge)}
          </span>
        )}
      </div>
    </div>
  );
}

function Edge(props: {
  from: { x: string; y: string };
  to: { x: string; y: string };
  label?: string;
  active?: boolean;
  vertical?: boolean;
  padStart?: number;
  padEnd?: number;
  thickness?: number;
}) {
  const {
    from,
    to,
    label,
    active,
    vertical,
    padStart = 0,
    padEnd = 0,
    thickness = 2,
  } = props;

  const x1 = parseFloat(from.x),
    y1 = parseFloat(from.y);
  const x2 = parseFloat(to.x),
    y2 = parseFloat(to.y);

  const left = `${Math.min(x1, x2)}%`;
  const top = `${Math.min(y1, y2)}%`;
  const width = `${Math.abs(x1 - x2)}%`;
  const height = `${Math.abs(y1 - y2)}%`;

  const isVertical = vertical || Math.abs(x1 - x2) < 2;

  const cropStyle: React.CSSProperties = isVertical
    ? {
        top: padStart,
        bottom: padEnd,
        width: thickness,
        left: '50%',
        transform: 'translateX(-50%)',
      }
    : {
        left: padStart,
        right: padEnd,
        height: thickness,
        top: '50%',
        transform: 'translateY(-50%)',
      };

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left, top, width, height }}
    >
      <div className="absolute rounded bg-slate-700/70" style={cropStyle} />
      {active && (
        <div
          className="absolute rounded"
          style={{
            ...cropStyle,
            background:
              'linear-gradient(90deg, rgba(99,102,241,0) 0%, rgba(99,102,241,0.6) 50%, rgba(99,102,241,0) 100%)',
            backgroundSize: '200% 100%',
            animation: isVertical
              ? 'dashY 1.2s linear infinite'
              : 'dashX 1.2s linear infinite',
          }}
        />
      )}
      {label && (
        <div
          className={cn(
            'absolute text-[10px] px-2 py-[2px] rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 shadow-sm',
            isVertical
              ? 'right-2 top-1/2 -translate-y-1/2'
              : 'top-2 left-1/2 -translate-x-1/2'
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
}

/** Conector en “L” (horizontal → vertical → horizontal) con padding */
function EdgeHV(props: {
  from: { x: string; y: string };
  to: { x: string; y: string };
  midX?: string;
  label?: string;
  active?: boolean;
  padStart?: number;
  padEnd?: number;
  vPadStart?: number;
  vPadEnd?: number;
  thickness?: number;
}) {
  const {
    from,
    to,
    label,
    active,
    midX = '58%',
    padStart = 0,
    padEnd = 0,
    vPadStart = 0,
    vPadEnd = 0,
    thickness = 2,
  } = props;
  return (
    <>
      <Edge
        from={from}
        to={{ x: midX, y: from.y }}
        active={active}
        label={label}
        padStart={padStart}
        thickness={thickness}
      />
      <Edge
        from={{ x: midX, y: from.y }}
        to={{ x: midX, y: to.y }}
        active={active}
        vertical
        padStart={vPadStart}
        padEnd={vPadEnd}
        thickness={thickness}
      />
      <Edge
        from={{ x: midX, y: to.y }}
        to={to}
        active={active}
        padEnd={padEnd}
        thickness={thickness}
      />
    </>
  );
}

// ===== Utils
function cryptoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `evt_${Math.random().toString(36).slice(2)}`;
  }
}
function humanQueue(q: QueueStatus) {
  switch (q) {
    case 'PENDING':
      return 'En espera de entrega';
    case 'RECEIVED':
      return 'Mensaje recibido';
    case 'PROCESSING':
      return 'Procesando';
    case 'DONE':
      return 'Completado';
    case 'FAILED':
      return 'Falló el procesamiento';
    case 'DLQ':
      return 'En Dead-Letter Queue';
  }
}
const keyframes = `
@keyframes dashX { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes dashY { 0% { background-position: 0 200%; } 100% { background-position: 0 -200%; } }
`;
