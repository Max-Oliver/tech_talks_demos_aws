/* eslint-disable */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
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
    return { name, ...a.Attributes };
  } catch (e) {
    return { name, error: String((e && e.message) || e) };
  }
}

// ----------------------- Endpoints -------------------
// health
app.get('/health', (_req, res) => res.json({ ok: true }));

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

// dominio: inventario/metrics/replenishments
app.get('/domain/inventory', async (_req, res) => {
  const inv = await getJsonOr('domain/inventory.json', []);
  res.json(inv);
});

app.post('/domain/inventory/seed', async (req, res) => {
  const items = req.body?.items || [];
  await putJson('domain/inventory.json', items);
  res.json({ ok: true, items: items.length });
});

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

app.get('/domain/replenishments', async (_req, res) => {
  const keys = await listKeys('domain/replenishments/');
  const out = [];
  for (const k of keys) {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k })
      );
      const d = JSON.parse(await obj.Body.transformToString());
      out.push(d);
    } catch {}
  }
  res.json(out);
});

// crear orden desde UI
app.post('/domain/order', async (req, res) => {
  const items = req.body?.items || [];
  if (!items.length) return res.status(400).json({ error: 'items vacíos' });
  const item = items[0];
  const orderId = req.body.orderId || uuid();
  const correlationId = req.body.correlationId || uuid();
  const arn = await ensureTopicArn();

  const payload = {
    eventType: 'OrderPlaced',
    priority: 'high',
    orderId,
    correlationId,
    product: item.productId,
    quantity: item.quantity,
    price: item.unitPrice,
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

  res.json({ ok: true, orderId, correlationId });
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
