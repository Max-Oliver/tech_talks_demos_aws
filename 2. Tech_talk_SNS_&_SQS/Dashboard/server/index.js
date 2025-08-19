/* eslint-disable */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  // 👇 NUEVOS:
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  PurgeQueueCommand,
  SendMessageBatchCommand,
} = require('@aws-sdk/client-sqs');
const {
  SNSClient,
  ListTopicsCommand,
  PublishCommand,
  CreateTopicCommand,
} = require('@aws-sdk/client-sns');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} = require('@aws-sdk/client-s3');

// ----------------------- Config -----------------------
const PORT = Number(process.env.PORT || 4000);
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || 'http://localhost:4566';
const AWS_KEY = process.env.AWS_ACCESS_KEY_ID || 'test';
const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY || 'test';
const DATA_BUCKET = process.env.DATA_BUCKET || 'demo-data';
const TOPIC_SUFFIX = process.env.TOPIC_SUFFIX || ':demo-fanout-topic';

const awsCfg = {
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET },
  endpoint: AWS_ENDPOINT,
};

const s3 = new S3Client({ ...awsCfg, forcePathStyle: true });
const sqs = new SQSClient(awsCfg);
const sns = new SNSClient(awsCfg);

// ----------------------- App -------------------------
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true })); // permite cualquier origen (ajusta si querés)
app.use(express.json({ limit: '2mb' }));

// logging simple
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ----------------------- Helpers ---------------------
function uuid() {
  return crypto.randomUUID();
}

async function ensureBucket(name) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
  }
}

async function ensureTopicArn() {
  const list = await sns.send(new ListTopicsCommand({}));
  const found = (list.Topics || []).find((t) =>
    (t.TopicArn || '').endsWith(TOPIC_SUFFIX)
  );
  if (found) return found.TopicArn;
  const created = await sns.send(
    new CreateTopicCommand({ Name: TOPIC_SUFFIX.split(':').pop() })
  );
  return created.TopicArn;
}

async function listKeys(prefix) {
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: DATA_BUCKET, Prefix: prefix })
  );
  return (out.Contents || []).map((o) => o.Key);
}

async function getJsonOr(key, fallback) {
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: DATA_BUCKET, Key: key })
    );
    const txt = await obj.Body.transformToString();
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function putJson(key, obj) {
  await s3.send(
    new PutObjectCommand({
      Bucket: DATA_BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify(obj)),
      ContentType: 'application/json',
    })
  );
}

async function qStats(name) {
  try {
    const url = await sqs
      .send(new GetQueueUrlCommand({ QueueName: name }))
      .then((r) => r.QueueUrl);
    const a = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
        ],
      })
    );

    const A = a.Attributes || {};
    return {
      name,
      ApproximateNumberOfMessages: Number(A.ApproximateNumberOfMessages || 0),
      ApproximateNumberOfMessagesNotVisible: Number(
        A.ApproximateNumberOfMessagesNotVisible || 0
      ),
      ApproximateNumberOfMessagesDelayed: Number(
        A.ApproximateNumberOfMessagesDelayed || 0
      ),
    };
    return { name, ...a.Attributes };
  } catch (e) {
    return { name, error: String((e && e.message) || e) };
  }
}

async function getCounters() {
  return await getJsonOr('domain/counters.json', {
    lastOrderNo: 0,
    lastCorrNo: 0,
  });
}
async function setCounters(c) {
  await putJson('domain/counters.json', { ...c });
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

async function nextOrderId() {
  const c = await getCounters();
  c.lastOrderNo += 1;
  await setCounters(c);
  return pad3(c.lastOrderNo);
}

async function nextCorrelationId() {
  const c = await getCounters();
  c.lastCorrNo += 1;
  await setCounters(c);
  return pad3(c.lastCorrNo);
}

function shortUuid() {
  return crypto.randomUUID().split('-')[0];
} // más legible en UI

async function getQueueUrl(name) {
  const out = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
  return out.QueueUrl;
}

async function peekMessages(name, max = 10) {
  const QueueUrl = await getQueueUrl(name);
  const resp = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: Math.max(1, Math.min(10, Number(max) || 10)),
      VisibilityTimeout: 0, // 👈 no bloquear
      WaitTimeSeconds: 0,
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    })
  );
  return (resp.Messages || []).map((m) => ({
    id: m.MessageId,
    receipt: m.ReceiptHandle,
    body: (() => {
      try {
        return JSON.parse(m.Body || '{}');
      } catch {
        return m.Body;
      }
    })(),
    attributes: m.Attributes || {},
  }));
}

async function purgeQueue(name) {
  const QueueUrl = await getQueueUrl(name);
  await sqs.send(new PurgeQueueCommand({ QueueUrl }));
}

async function retryFromDlq(dlqName, sourceName, receipt, body) {
  const srcUrl = await getQueueUrl(sourceName);
  const dlqUrl = await getQueueUrl(dlqName);
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: srcUrl,
      MessageBody: typeof body === 'string' ? body : JSON.stringify(body || {}),
    })
  );
  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: dlqUrl, ReceiptHandle: receipt })
  );
}
const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

async function recordReplenishment({
  productId,
  addedUnits,
  previousStock,
  newStock,
  type = 'manual_restock',
  reason = 'inventory_seed',
}) {
  const id = `repl-${Date.now()}-${productId}`;
  const obj = {
    id,
    productId,
    type, // 'manual_restock' | 'new_product' | 'out_of_stock'
    reason,
    addedUnits: Number(addedUnits || 0),
    previousStock: Number(previousStock ?? 0),
    newStock: Number(newStock ?? 0),
    t: Date.now(),
  };
  await putJson(`domain/replenishments/${id}.json`, obj);
  return obj;
}

// ----------------------- Endpoints -------------------
// health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---- DLQ API ----
// GET /dlq/:name/peek?max=10
app.get('/dlq/:name/peek', async (req, res) => {
  try {
    const items = await peekMessages(req.params.name, req.query.max);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// POST /dlq/:dlq/retry  { source, receipt, body }
app.post('/dlq/:dlq/retry', async (req, res) => {
  const { source, receipt, body } = req.body || {};
  if (!source || !receipt || body == null) {
    return res.status(400).json({ error: 'Missing source/receipt/body' });
  }
  try {
    await retryFromDlq(req.params.dlq, source, receipt, body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// DELETE /dlq/:name/purge
app.delete('/dlq/:name/purge', async (req, res) => {
  try {
    await purgeQueue(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
// ---- Throttling: enviar burst a demo-thr ----
// POST /throttle/burst  { count?: number }
app.post('/throttle/burst', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(500, Number(req.body?.count || 120)));
    const QueueUrl = await getQueueUrl('demo-thr');
    let sent = 0,
      id = 0;

    while (sent < n) {
      const batch = Array.from({ length: Math.min(10, n - sent) }, () => ({
        Id: String(++id),
        MessageBody: JSON.stringify({ kind: 'thr', i: id, t: Date.now() }),
      }));
      await sqs.send(new SendMessageBatchCommand({ QueueUrl, Entries: batch }));
      sent += batch.length;
    }
    res.json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// colas (SQS)
app.get('/queues', async (_req, res) => {
  const names = [
    'demo-fulfill-sqs',
    'demo-analytics-sqs',
    'demo-fulfill-sqs-dlq',
    'demo-analytics-sqs-dlq',
    'demo-thr',
    'demo-thr-dlq',
  ];
  const data = await Promise.all(names.map((q) => qStats(q)));
  res.json(data);
});

// listar archivos S3
app.get('/files', async (req, res) => {
  const prefix = String(req.query.prefix || '');
  const keys = await listKeys(prefix);
  keys.sort((a, b) => (a < b ? -1 : 1));
  res.json(keys.slice(-150));
});

// obtener archivo S3
app.get('/file', async (req, res) => {
  const key = String(req.query.key || '');
  if (!key) return res.status(400).json({ error: 'missing key' });
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: DATA_BUCKET, Key: key })
    );
    res.setHeader(
      'Content-Type',
      obj.ContentType || 'application/octet-stream'
    );
    obj.Body.pipe(res);
  } catch (e) {
    res.status(404).json({ error: String((e && e.message) || e) });
  }
});

// trazas (resumen por CID)
app.get('/traces', async (_req, res) => {
  const keys = await listKeys('traces/');
  const ids = [...new Set(keys.map((k) => k.split('/')[1]).filter(Boolean))];
  const out = [];
  for (const id of ids) {
    const child = await listKeys(`traces/${id}/`);
    const names = child.map((k) => k.split('/').pop());
    out.push({
      id,
      published: names.includes('00-published.json'),
      routes: names.includes('01-routes.json'),
      f_recv: names.includes('10-fulfillment-received.json'),
      f_done: names.includes('20-fulfillment-processed.json'),
      a_recv: names.includes('11-analytics-received.json'),
      a_done: names.includes('21-analytics-processed.json'),
      dlq: names.includes('50-dlq.json'),
    });
  }
  res.json(out);
});

app.get('/trace/:id', async (req, res) => {
  const id = req.params.id;
  const child = await listKeys(`traces/${id}/`);
  const keys = child.sort();
  const steps = [];
  for (const k of keys) steps.push({ key: k, data: await getJsonOr(k, null) });

  const wantsHtml =
    req.query.format === 'html' ||
    (req.get('accept') || '').includes('text/html');
  if (wantsHtml) {
    const html = steps
      .map((s) => {
        const name = s.key.split('/').pop() || s.key;
        return `<div><code>${name}</code> — ${JSON.stringify(s.data)}</div>`;
      })
      .join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<div><div>Trace <b>${id}</b></div>${html}</div>`);
  }

  res.json({ id, steps }); // JSON por defecto
});

// payload publicado (para reproducir en Visualizer por cid)
app.get('/trace/:id/published', async (req, res) => {
  const id = req.params.id;
  const obj = await getJsonOr(`traces/${id}/00-published.json`, null);
  const payload = obj?.message ?? obj;
  if (!payload) return res.status(404).json({ error: 'not found' });
  res.json(payload);
});

// seeds: publica 3 eventos trazables
app.post('/seed/fanout-trace', async (_req, res) => {
  const arn = await ensureTopicArn();
  const events = [
    {
      eventType: 'OrderPlaced',
      priority: 'high',
      product: 'StartUp book',
      quantity: 1,
      price: 10,
    },
    {
      eventType: 'OrderUpdated',
      priority: 'low',
      product: 'StartUp book',
      quantity: 1,
      price: 10,
    },
    {
      eventType: 'OrderShipped',
      priority: 'high',
      product: 'StartUp book',
      quantity: 1,
      price: 10,
    },
  ];
  const ids = [];
  for (const e of events) {
    const correlationId = uuid();
    const orderId = uuid();
    await putJson(`traces/${correlationId}/00-published.json`, {
      t: Date.now(),
      message: { orderId, ...e, correlationId },
    });
    await putJson(`traces/${correlationId}/01-routes.json`, {
      fulfillment: ['OrderPlaced', 'OrderUpdated'].includes(e.eventType),
      analytics:
        ['OrderPlaced', 'OrderShipped'].includes(e.eventType) &&
        e.priority === 'high',
    });
    await sns.send(
      new PublishCommand({
        TopicArn: arn,
        Message: JSON.stringify({ orderId, ...e, correlationId }),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: e.eventType },
          priority: { DataType: 'String', StringValue: e.priority },
        },
      })
    );
    ids.push(correlationId);
  }
  res.json({ ok: true, correlationIds: ids });
});

// publicar custom desde UI (para panel Mensajería)
app.post('/seed/custom', async (req, res) => {
  const {
    orderId,
    eventType,
    priority = 'high',
    correlationId,
    payload = {},
  } = req.body || {};
  const oId = orderId || uuid();
  const cId = correlationId || uuid();
  const arn = await ensureTopicArn();

  const msg = {
    orderId: oId,
    eventType,
    priority,
    correlationId: cId,
    ...payload,
  };
  await putJson(`traces/${cId}/00-published.json`, {
    t: Date.now(),
    message: msg,
  });
  await putJson(`traces/${cId}/01-routes.json`, {
    fulfillment: ['OrderPlaced', 'OrderUpdated'].includes(eventType),
    analytics:
      ['OrderPlaced', 'OrderShipped'].includes(eventType) &&
      priority === 'high',
  });

  await sns.send(
    new PublishCommand({
      TopicArn: arn,
      Message: JSON.stringify(msg),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: eventType },
        priority: { DataType: 'String', StringValue: priority },
      },
    })
  );

  res.json({ ok: true, correlationId: cId, orderId: oId });
});

// inventario: inventario/metrics/replenishments
app.get('/domain/inventory', async (_req, res) => {
  const inv = await getJsonOr('domain/inventory.json', []);
  res.json(inv);
});

// inventario: Crear y guardar pruductos
app.post('/domain/inventory/seed', async (req, res) => {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];

  const incoming = raw
    .map((it) => ({
      productId: String(it.productId ?? it.product ?? '').trim(),
      name: String(it.name ?? it.productId ?? 'Unnamed').trim(),
      price: Number(it.price ?? 0),
      stock: Number(it.stock ?? it.quantity ?? 0),
      reserved: it.reserved != null ? Number(it.reserved) : undefined,
    }))
    .filter((x) => x.productId || x.name);

  const existing = await getJsonOr('domain/inventory.json', []);
  const byId = new Map(existing.map((p) => [String(p.productId), { ...p }]));
  const byName = new Map(
    existing.map((p) => [norm(p.name || p.productId), String(p.productId)])
  );

  let created = 0,
    updated = 0,
    restocked = 0;

  for (const inc of incoming) {
    const matchById = inc.productId && byId.get(inc.productId);
    const matchByNameId =
      !matchById && inc.name ? byName.get(norm(inc.name)) : null;
    const cur = matchById || (matchByNameId && byId.get(matchByNameId));

    if (!cur) {
      // nuevo producto
      const productId = inc.productId || crypto.randomUUID().slice(0, 8);
      const newItem = {
        productId,
        name: inc.name || productId,
        price: Number(inc.price || 0),
        stock: Number(inc.stock || 0),
        reserved: Number(inc.reserved ?? 0),
        updatedAt: Date.now(),
      };
      byId.set(productId, newItem);
      byName.set(norm(newItem.name || newItem.productId), productId);
      created++;

      if (newItem.stock > 0) {
        await recordReplenishment({
          productId,
          addedUnits: newItem.stock,
          previousStock: 0,
          newStock: newItem.stock,
          type: 'new_product',
        });
        restocked++;
      }
    } else {
      // existente → SUMAR stock (reposiciona)
      const prev = Number(cur.stock || 0);
      const add = Number(inc.stock || 0);

      if (inc.name) cur.name = inc.name;
      if (inc.price != null) cur.price = Number(inc.price);
      if (inc.reserved != null) cur.reserved = Number(inc.reserved);

      cur.stock = prev + add;
      cur.updatedAt = Date.now();
      byId.set(String(cur.productId), cur);
      updated++;

      if (add > 0) {
        await recordReplenishment({
          productId: cur.productId,
          addedUnits: add,
          previousStock: prev,
          newStock: cur.stock,
          type: 'manual_restock',
        });
        restocked++;
      }
    }
  }

  const merged = [...byId.values()];
  await putJson('domain/inventory.json', merged);

  res.json({ ok: true, created, updated, restocked, total: merged.length });
});

// inventario: Repongo si no hay un producto en inventario
app.post('/domain/replenishments/create', async (req, res) => {
  const { productId, missingQty, reason = 'out_of_stock' } = req.body || {};
  if (!productId || !missingQty)
    return res.status(400).json({ error: 'missing productId/missingQty' });
  const id = `${Date.now()}-${productId}`;
  const obj = {
    id,
    productId,
    missingQty: Number(missingQty),
    reason,
    t: Date.now(),
  };
  await putJson(`domain/replenishments/${id}.json`, obj);
  res.json({ ok: true, replenishment: obj });
});

// inventario: Actualizo inventario
app.get('/domain/metrics', async (_req, res) => {
  const keys = await listKeys('analytics/');
  const agg = new Map();
  for (const k of keys) {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k })
      );
      const d = JSON.parse(await obj.Body.transformToString());
      const id = d.productId || d.product || 'UNKNOWN';
      const cur = agg.get(id) || {
        productId: id,
        unitsSold: 0,
        totalRevenue: 0,
      };
      const units = Number(d.quantity || 0);
      const price = Number(d.price || 0);
      cur.unitsSold += units;
      cur.totalRevenue += units * price;
      agg.set(id, cur);
    } catch {}
  }
  res.json([...agg.values()]);
});

// deprecado: inventario: Reabastecimientos pendientes
app.get('/domain/replenishments', async (_req, res) => {
  const keys = await listKeys('domain/replenishments/');
  const out = [];
  for (const k of keys) {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k })
      );
      const d = JSON.parse(await obj.Body.transformToString());
      out.push({ ...d, key: k });
    } catch {}
  }
  res.json(out);
});

// crear orden desde UI
app.post('/domain/order', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'items vacíos' });

  // IDs por defecto NNN-uuid (permití override desde UI)
  const orderNo = req.body.orderId?.split('-')[0] || (await nextOrderId());
  const corrNo =
    req.body.correlationId?.split('-')[0] || (await nextCorrelationId());
  const orderId = `${orderNo}-${shortUuid()}`;
  const correlationId = `${corrNo}-${shortUuid()}`;

  // 1 item por ahora
  const wanted = items[0];
  const inv = await getJsonOr('domain/inventory.json', []);
  const prod = inv.find(
    (p) => p.productId === wanted.productId || p.name === wanted.productId
  );

  const unitPrice = prod?.price ?? Number(wanted.unitPrice || 0);
  const have = Number(prod?.stock ?? 0);
  const want = Number(wanted.quantity || 0);

  let purchaseQty = Math.min(have, want);
  const shortage = Math.max(0, want - purchaseQty);

  // si no hay producto en inventario, lo tratamos como stock 0
  if (!prod)
    console.warn('Producto no encontrado en inventario:', wanted.productId);

  // actualizar inventario (descuenta lo que se puede vender)
  if (prod) {
    prod.stock = Math.max(0, have - purchaseQty);
    prod.updatedAt = Date.now();
    await putJson('domain/inventory.json', inv);
  }

  // crear reposición automática si falta stock
  let createdRepl = null;
  if (shortage > 0) {
    const id = `${Date.now()}-${wanted.productId}`;
    const repl = {
      id,
      productId: wanted.productId,
      missingQty: shortage,
      reason: 'out_of_stock',
      t: Date.now(),
    };
    await putJson(`domain/replenishments/${id}.json`, repl);
    createdRepl = repl;
  }

  const arn = await ensureTopicArn();

  // Publicar solo si hay algo que procesar
  if (purchaseQty > 0) {
    const payload = {
      eventType: 'OrderPlaced',
      priority: 'high',
      orderId,
      correlationId,
      product: wanted.productId,
      quantity: purchaseQty,
      price: unitPrice,
    };

    await putJson(`traces/${correlationId}/00-published.json`, {
      t: Date.now(),
      message: payload,
    });
    await putJson(`traces/${correlationId}/01-routes.json`, {
      fulfillment: true,
      analytics: true,
    });

    await sns.send(
      new PublishCommand({
        TopicArn: arn,
        Message: JSON.stringify(payload),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'OrderPlaced' },
          priority: { DataType: 'String', StringValue: 'high' },
        },
      })
    );
  }

  res.json({
    ok: true,
    orderId,
    correlationId,
    unitPrice,
    purchaseQty,
    shortage,
    createdReplenishment: createdRepl,
    total: unitPrice * purchaseQty,
  });
});

// ----------------------- Start -----------------------
(async () => {
  try {
    await ensureBucket(DATA_BUCKET);
    app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
