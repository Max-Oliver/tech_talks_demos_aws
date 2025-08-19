import express from 'express';
import cors from 'cors';
import {
  SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import {
  SNSClient, ListTopicsCommand, PublishCommand,
} from '@aws-sdk/client-sns';
import {
  S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json());

const cfg = {
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  endpoint: 'http://localhost:4566',
};
const sqs = new SQSClient(cfg);
const sns = new SNSClient(cfg);
const s3  = new S3Client({ ...cfg, forcePathStyle: true });

const DATA_BUCKET = 'demo-data';

// helpers
async function qStats(name){
  const url = await sqs.send(new GetQueueUrlCommand({ QueueName: name })).then(r => r.QueueUrl);
  const a = await sqs.send(new GetQueueAttributesCommand({
    QueueUrl: url,
    AttributeNames: [
      'ApproximateNumberOfMessages',
      'ApproximateNumberOfMessagesNotVisible',
      'ApproximateNumberOfMessagesDelayed',
    ],
  }));
  return { name, ...a.Attributes };
}

async function putJson(key, obj){
  await s3.send(new PutObjectCommand({
    Bucket: DATA_BUCKET,
    Key: key,
    Body: Buffer.from(JSON.stringify(obj)),
    ContentType: 'application/json',
  }));
}
async function getJsonOr(key, fallback){
  try{
    const o = await s3.send(new GetObjectCommand({ Bucket: DATA_BUCKET, Key: key }));
    return JSON.parse(await o.Body.transformToString());
  }catch{ return fallback; }
}
async function listKeys(prefix){
  const out = await s3.send(new ListObjectsV2Command({ Bucket: DATA_BUCKET, Prefix: prefix }));
  return (out.Contents || []).map(o => o.Key);
}
function uuid(){ return crypto.randomUUID(); }

// ---------------- core endpoints ----------------
app.get('/queues', async (_req,res)=>{
  const names = [
    'demo-fulfill-sqs','demo-analytics-sqs',
    'demo-fulfill-sqs-dlq','demo-analytics-sqs-dlq',
    'demo-thr','demo-thr-dlq'
  ];
  const data = await Promise.all(names.map(q=>qStats(q).catch(e=>({name:q, error:String(e)}))));
  res.json(data);
});

app.get('/files', async (req,res)=>{
  const keys = await listKeys(req.query.prefix || '');
  keys.sort((a,b)=> a<b? -1: 1);
  res.json(keys.slice(-150)); // limitar
});

app.get('/file', async (req,res)=>{
  const key = req.query.key;
  try{
    const obj = await s3.send(new GetObjectCommand({ Bucket: DATA_BUCKET, Key: key }));
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    obj.Body.pipe(res);
  }catch(e){ res.status(404).json({error:String(e)}); }
});

// --------- trazas (se infiere por archivos en S3/traces/<id>/...) ----------
app.get('/traces', async (_req, res)=>{
  const keys = await listKeys('traces/');
  const ids = [...new Set(keys.map(k => k.split('/')[1]).filter(Boolean))];
  const summaries = [];
  for(const id of ids){
    const child = await listKeys(`traces/${id}/`);
    const names = child.map(k => k.split('/').pop());
    summaries.push({
      id,
      published: names.includes('00-published.json'),
      routes:    names.includes('01-routes.json'),
      f_recv:    names.includes('10-fulfillment-received.json'),
      f_done:    names.includes('20-fulfillment-processed.json'),
      a_recv:    names.includes('11-analytics-received.json'),
      a_done:    names.includes('21-analytics-processed.json'),
    });
  }
  res.json(summaries);
});

app.get('/trace/:id', async (req,res)=>{
  const id = req.params.id;
  const child = await listKeys(`traces/${id}/`);
  const keys = child.sort();
  const steps = [];
  for(const k of keys){
    const obj = await s3.send(new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k }));
    const body = await obj.Body.transformToString();
    steps.push({ key:k, data: JSON.parse(body) });
  }
  res.json({ id, steps });
});

// publica 3 eventos “trazables”
app.post('/seed/fanout-trace', async (_req,res)=>{
  const topics = await sns.send(new ListTopicsCommand({}));
  const arn = topics.Topics.find(t => t.TopicArn.endsWith(':demo-fanout-topic')).TopicArn;
  const events = [
    { eventType:'OrderPlaced',  priority:'high', product:'StartUp book', quantity:1, price:10 },
    { eventType:'OrderUpdated', priority:'low',  product:'StartUp book', quantity:1, price:10 },
    { eventType:'OrderShipped', priority:'high', product:'StartUp book', quantity:1, price:10 },
  ];
  const ids=[];
  for(const e of events){
    const correlationId = uuid();
    const orderId = uuid();

    await putJson(`traces/${correlationId}/00-published.json`, { t: Date.now(), message: { orderId, ...e, correlationId }});
    await putJson(`traces/${correlationId}/01-routes.json`, {
      fulfillment: ['OrderPlaced','OrderUpdated'].includes(e.eventType),
      analytics:   ['OrderPlaced','OrderShipped'].includes(e.eventType) && e.priority==='high'
    });

    await sns.send(new PublishCommand({
      TopicArn: arn,
      Message: JSON.stringify({ orderId, ...e, correlationId }),
      MessageAttributes: {
        eventType: { DataType:'String', StringValue: e.eventType },
        priority:  { DataType:'String', StringValue: e.priority  },
      }
    }));
    ids.push(correlationId);
  }
  res.json({ ok:true, correlationIds: ids });
});

// publicar custom desde UI
app.post('/seed/custom', async (req,res)=>{
  const { orderId, eventType, priority='high', correlationId, payload={} } = req.body || {};
  const oId = orderId || uuid();
  const cId = correlationId || uuid();

  const topics = await sns.send(new ListTopicsCommand({}));
  const arn = topics.Topics.find(t => t.TopicArn.endsWith(':demo-fanout-topic')).TopicArn;

  const msg = { orderId: oId, eventType, priority, correlationId: cId, ...payload };
  await putJson(`traces/${cId}/00-published.json`, { t: Date.now(), message: msg });
  await putJson(`traces/${cId}/01-routes.json`, {
    fulfillment: ['OrderPlaced','OrderUpdated'].includes(eventType),
    analytics:   ['OrderPlaced','OrderShipped'].includes(eventType) && priority==='high'
  });

  await sns.send(new PublishCommand({
    TopicArn: arn,
    Message: JSON.stringify(msg),
    MessageAttributes: {
      eventType: { DataType:'String', StringValue: eventType },
      priority:  { DataType:'String', StringValue: priority  },
    }
  }));
  res.json({ ok:true, correlationId: cId, orderId: oId });
});

// --------- Dominio: Inventario/Métricas/Replenishments (simple en S3) -----
app.get('/domain/inventory', async (_req,res)=>{
  const inv = await getJsonOr('domain/inventory.json', []);
  res.json(inv);
});

app.post('/domain/inventory/seed', async (req,res)=>{
  const items = req.body?.items || [];
  await putJson('domain/inventory.json', items);
  res.json({ ok:true, items: items.length });
});

// Métricas: agregamos todo lo que haya en analytics/*
app.get('/domain/metrics', async (_req,res)=>{
  const keys = await listKeys('analytics/');
  const agg = new Map();
  for(const k of keys){
    try{
      const o = await s3.send(new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k }));
      const d = JSON.parse(await o.Body.transformToString());
      const id = d.productId || d.product || 'UNKNOWN';
      const a = agg.get(id) || { productId:id, unitsSold:0, totalRevenue:0 };
      const units = Number(d.quantity||0);
      const price = Number(d.price||0);
      a.unitsSold += units;
      a.totalRevenue += units*price;
      agg.set(id, a);
    }catch{}
  }
  res.json([...agg.values()]);
});

app.get('/domain/replenishments', async (_req,res)=>{
  const keys = await listKeys('domain/replenishments/');
  const out = [];
  for(const k of keys){
    try{
      const o = await s3.send(new GetObjectCommand({ Bucket: DATA_BUCKET, Key: k }));
      const d = JSON.parse(await o.Body.transformToString());
      out.push(d);
    }catch{}
  }
  res.json(out);
});

// crear orden desde UI (publica OrderPlaced al topic)
app.post('/domain/order', async (req,res)=>{
  const items = req.body?.items || [];
  if(!items.length) return res.status(400).json({error:"items vacíos"});
  const item = items[0];
  const orderId = req.body.orderId || uuid();
  const correlationId = req.body.correlationId || uuid();

  const topics = await sns.send(new ListTopicsCommand({}));
  const arn = topics.Topics.find(t => t.TopicArn.endsWith(':demo-fanout-topic')).TopicArn;

  const payload = {
    eventType: 'OrderPlaced',
    priority:  'high',
    orderId, correlationId,
    product: item.productId, quantity: item.quantity, price: item.unitPrice
  };

  await putJson(`traces/${correlationId}/00-published.json`, { t: Date.now(), message: payload });
  await putJson(`traces/${correlationId}/01-routes.json`, { fulfillment:true, analytics:true });

  await sns.send(new PublishCommand({
    TopicArn: arn,
    Message: JSON.stringify(payload),
    MessageAttributes: {
      eventType: { DataType:'String', StringValue:'OrderPlaced' },
      priority:  { DataType:'String', StringValue:'high' }
    }
  }));

  res.json({ ok:true, orderId, correlationId });
});

app.listen(4000, ()=> console.log('UI API on http://localhost:4000'));
