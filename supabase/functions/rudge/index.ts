// Rudge — servidor de notificações push.
//
// Rotas (POST):
//   /sync         app envia a fila de avisos dos próximos 30 dias deste aparelho
//   /subscribe    registra a assinatura de push do navegador
//   /unsubscribe  remove a assinatura
//   /action       botões "Concluir"/"Adiar" tocados com o app fechado
//   /test         agenda um aviso de teste para daqui a N segundos
//   /ai           interpreta uma fala (voz) em lembretes/tarefas com o Claude
//   /status       resumo (assinaturas e avisos programados)
//   /dispatch     chamado pelo pg_cron a cada minuto: envia o que venceu
//
// Autenticação: header x-rudge-token (derivado da senha no login) ou x-cron-secret (cron).
// Os dados ficam no schema "rudge", que não é exposto pela API REST.

import postgres from 'npm:postgres@3.4.5';
import { sendWebPush, type VapidKeys } from './webpush.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });

/** Hoje há um único dono; no SaaS isso vira o id do usuário autenticado. */
const OWNER = 'owner';
const MAX_ITEMS = 3000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-rudge-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

let cache: { at: number; values: Record<string, string> } | null = null;
async function secrets(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.values;
  const rows = await sql<{ name: string; decrypted_secret: string }[]>`
    select name, decrypted_secret from vault.decrypted_secrets where name like 'rudge_%'`;
  cache = { at: Date.now(), values: Object.fromEntries(rows.map((r) => [r.name, r.decrypted_secret])) };
  return cache.values;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function ownerFrom(req: Request): Promise<string | null> {
  const token = req.headers.get('x-rudge-token');
  if (!token || token.length > 200) return null;
  const s = await secrets();
  return safeEqual(await sha256Hex(token), s.rudge_token_sha256 ?? '') ? OWNER : null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Normaliza um item da fila vindo do app. */
function toPayload(i: Record<string, unknown>) {
  const actions = Array.isArray(i.actions)
    ? (i.actions as Record<string, unknown>[]).slice(0, 2).map((a) => ({ action: str(a.action, 20), title: str(a.title, 40) }))
    : [];
  return {
    key: str(i.key, 300),
    title: str(i.title, 200),
    body: str(i.body, 600),
    kind: str(i.kind, 20),
    refId: i.refId ? str(i.refId, 100) : undefined,
    occ: typeof i.occ === 'number' ? i.occ : undefined,
    url: str(i.url, 200) || '#/inicio',
    actions,
    requireInteraction: !!i.requireInteraction,
    snoozeMin: typeof i.snoozeMin === 'number' ? Math.min(Math.max(i.snoozeMin, 1), 24 * 60) : 10,
  };
}

/* ---------------- rotas ---------------- */

async function sync(owner: string, body: Record<string, unknown>) {
  const deviceId = str(body.deviceId, 100);
  if (!deviceId || !Array.isArray(body.items)) return json({ error: 'payload inválido' }, 400);
  const now = Date.now();
  const rows = (body.items as Record<string, unknown>[])
    .slice(0, MAX_ITEMS)
    .filter((i) => typeof i.key === 'string' && typeof i.at === 'number' && i.at > now - 60_000)
    .map((i) => ({
      owner_id: owner,
      device_id: deviceId,
      key: str(i.key, 300),
      fire_at: new Date(i.at as number),
      grace_seconds: Math.round(Math.min(Math.max(Number(i.grace) || 3_600_000, 60_000), 48 * 3_600_000) / 1000),
      payload: sql.json(toPayload(i)),
    }));

  // Vale a fila do aparelho com os dados editados por último; aparelhos desatualizados
  // não programam nada (senão disparariam lembretes com horário antigo ou já concluídos).
  const editedAt = typeof body.editedAt === 'number' && Number.isFinite(body.editedAt) ? Math.floor(body.editedAt) : 0;
  let stale = false;
  await sql.begin(async (tx) => {
    await tx`insert into rudge.owners (owner_id) values (${owner}) on conflict (owner_id) do nothing`;
    const [o] = await tx`select data_device, data_edited_at from rudge.owners where owner_id = ${owner} for update`;
    stale = !!o.data_device && o.data_device !== deviceId && editedAt < Number(o.data_edited_at);
    await tx`delete from rudge.notifications where owner_id = ${owner} and device_id = ${deviceId} and sent_at is null`;
    if (stale) return;
    await tx`update rudge.owners set data_device = ${deviceId}, data_edited_at = greatest(${editedAt}, case when data_device = ${deviceId} then data_edited_at else 0 end), updated_at = now()
      where owner_id = ${owner}`;
    await tx`delete from rudge.notifications
      where owner_id = ${owner} and sent_at is null and device_id <> ${deviceId} and device_id not in ('server', 'test')`;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await tx`insert into rudge.notifications ${tx(chunk, 'owner_id', 'device_id', 'key', 'fire_at', 'grace_seconds', 'payload')}
        on conflict (owner_id, device_id, key) do nothing`;
    }
    // não reenviar o que já foi disparado
    await tx`delete from rudge.notifications n
      where n.owner_id = ${owner} and n.device_id = ${deviceId} and n.sent_at is null
        and exists (select 1 from rudge.notifications s where s.owner_id = n.owner_id and s.key = n.key and s.sent_at is not null)`;
  });
  const [{ count, next }] = await sql`select count(*)::int as count, min(fire_at) as next from rudge.notifications
    where owner_id = ${owner} and sent_at is null`;
  return json({ ok: true, stored: stale ? 0 : rows.length, pending: count, next, stale });
}

async function subscribe(owner: string, body: Record<string, unknown>) {
  const deviceId = str(body.deviceId, 100);
  const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  const endpoint = str(sub?.endpoint, 1000);
  const p256dh = str(sub?.keys?.p256dh, 200);
  const auth = str(sub?.keys?.auth, 100);
  if (!deviceId || !endpoint.startsWith('https://') || !p256dh || !auth) return json({ error: 'assinatura inválida' }, 400);
  await sql`insert into rudge.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth, user_agent)
    values (${owner}, ${deviceId}, ${endpoint}, ${p256dh}, ${auth}, ${str(body.userAgent, 300)})
    on conflict (endpoint) do update set owner_id = excluded.owner_id, device_id = excluded.device_id,
      p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent,
      failures = 0, last_seen_at = now()`;
  // uma assinatura por aparelho: a antiga (trocada pelo navegador) gerava avisos em dobro
  await sql`delete from rudge.push_subscriptions where owner_id = ${owner} and device_id = ${deviceId} and endpoint <> ${endpoint}`;
  return json({ ok: true });
}

async function unsubscribe(owner: string, body: Record<string, unknown>) {
  await sql`delete from rudge.push_subscriptions where owner_id = ${owner} and endpoint = ${str(body.endpoint, 1000)}`;
  return json({ ok: true });
}

async function action(owner: string, body: Record<string, unknown>) {
  const act = str(body.action, 20);
  const data = (body.data ?? {}) as Record<string, unknown>;
  const refId = data.refId ? str(data.refId, 100) : '';
  if (act === 'snooze') {
    const min = typeof data.snoozeMin === 'number' ? Math.min(Math.max(data.snoozeMin, 1), 24 * 60) : 10;
    const key = `snz:${str(data.key, 200)}:${Date.now()}`;
    const payload = toPayload({
      ...data,
      key,
      actions: [
        { action: 'done', title: 'Concluir' },
        { action: 'snooze', title: `Adiar ${min} min` },
      ],
      requireInteraction: true,
    });
    await sql`insert into rudge.notifications (owner_id, device_id, key, fire_at, grace_seconds, payload)
      values (${owner}, 'server', ${key}, now() + make_interval(mins => ${min}), 86400, ${sql.json(payload)})`;
    return json({ ok: true, snoozedFor: min });
  }
  if (act === 'done' && refId) {
    // cancela adiamentos e a mesma ocorrência ainda não enviada
    await sql`delete from rudge.notifications
      where owner_id = ${owner} and sent_at is null and payload->>'refId' = ${refId}
        and (key like 'snz:%' or payload->>'occ' = ${String(data.occ ?? '')})`;
    return json({ ok: true });
  }
  return json({ ok: true });
}

async function test(owner: string, body: Record<string, unknown>) {
  const delay = Math.min(Math.max(Number(body.delaySec) || 60, 5), 3600);
  const key = `test:${Date.now()}`;
  const payload = toPayload({
    key,
    title: 'Teste do Rudge com o app fechado',
    body: 'Se este aviso chegou, as notificações estão funcionando mesmo com o Rudge fechado.',
    kind: 'test',
    url: '#/inicio',
    actions: [],
  });
  await sql`insert into rudge.notifications (owner_id, device_id, key, fire_at, grace_seconds, payload)
    values (${owner}, 'test', ${key}, now() + make_interval(secs => ${delay}), 1800, ${sql.json(payload)})`;
  return json({ ok: true, fireInSeconds: delay });
}

async function status(owner: string, body: Record<string, unknown>) {
  const deviceId = str(body.deviceId, 100);
  const [row] = await sql`select
      (select count(*)::int from rudge.push_subscriptions where owner_id = ${owner}) as devices,
      (select count(*)::int from rudge.push_subscriptions where owner_id = ${owner} and device_id = ${deviceId}) as this_device,
      (select count(*)::int from rudge.notifications where owner_id = ${owner} and sent_at is null) as pending,
      (select min(fire_at) from rudge.notifications where owner_id = ${owner} and sent_at is null) as next,
      (select max(sent_at) from rudge.notifications where owner_id = ${owner}) as last_sent,
      coalesce((select data_device = ${deviceId} from rudge.owners where owner_id = ${owner}), true) as source`;
  return json({ ok: true, ...row });
}


const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'reply'],
  properties: {
    reply: { type: 'string', description: 'Confirmação curta em português para ser falada ao usuário' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'date', 'time', 'repeat', 'days', 'priority'],
        properties: {
          kind: { type: 'string', enum: ['reminder', 'task'] },
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD ou vazio' },
          time: { type: 'string', description: 'HH:MM 24h ou vazio' },
          repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'] },
          days: { type: 'array', items: { type: 'integer' }, description: 'dias da semana 0=domingo (repeat weekly)' },
          priority: { type: 'integer', enum: [0, 1, 2, 3] },
        },
      },
    },
  },
};

async function interpret(body: Record<string, unknown>) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'no_key' }, 503);
  const text = str(body.text, 2000);
  if (!text) return json({ error: 'texto vazio' }, 400);
  const now = str(body.now, 60); // data/hora local do usuário, ex.: "domingo, 2026-10-18 17:05"
  // import sob demanda: se o SDK falhar, o resto do servidor (push) continua funcionando
  const { default: Anthropic } = await import('npm:@anthropic-ai/sdk@0.135.0');
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
    system:
      'Você é o assistente do Rudge, um app pessoal de organização. Converta o que o usuário falou (transcrição de voz em português) em lembretes e tarefas. ' +
      'Pedidos com "me lembra/lembre" ou com horário viram kind=reminder; afazeres sem hora marcada viram task. Separe pedidos distintos em itens distintos. ' +
      'Resolva datas relativas a partir do momento atual informado; se não houver data mas houver hora já passada hoje, use amanhã. Lembrete sem hora: 09:00. ' +
      'Títulos curtos, começando com verbo, sem a data/hora. reply: uma frase curta e natural confirmando o que vai ser criado.',
    messages: [{ role: 'user', content: `Agora: ${now}\nFala do usuário: ${text}` }],
  });
  if (res.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
  const block = res.content.find((b) => b.type === 'text');
  return json({ ok: true, ...JSON.parse(block && block.type === 'text' ? block.text : '{}') });
}

async function dispatch() {
  const s = await secrets();
  const vapid: VapidKeys = {
    publicKey: s.rudge_vapid_public,
    privateKey: s.rudge_vapid_private,
    subject: s.rudge_vapid_subject || 'https://rudge.vercel.app',
  };
  // "reserva" atômica do que venceu (evita envio duplicado se duas execuções se sobrepuserem)
  const claimed = await sql<{ owner_id: string; key: string; fire_at: Date; grace_seconds: number; payload: Record<string, unknown> }[]>`
    update rudge.notifications set sent_at = now()
    where sent_at is null and fire_at <= now()
    returning owner_id, key, fire_at, grace_seconds, payload`;

  const seen = new Set<string>();
  const items = claimed
    .sort((a, b) => a.fire_at.getTime() - b.fire_at.getTime())
    .filter((r) => {
      const k = `${r.owner_id}|${r.key}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const subsByOwner = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();

  for (const item of items) {
    const lateMs = now - item.fire_at.getTime();
    if (lateMs > item.grace_seconds * 1000) {
      skipped++;
      continue;
    }
    if (!subsByOwner.has(item.owner_id)) {
      subsByOwner.set(
        item.owner_id,
        await sql`select id, endpoint, p256dh, auth from rudge.push_subscriptions where owner_id = ${item.owner_id}`,
      );
    }
    const payload = {
      ...item.payload,
      at: item.fire_at.getTime(),
      body: lateMs > 5 * 60_000 ? `Atrasado · ${item.payload.body ?? ''}` : item.payload.body,
    };
    const ttl = Math.max(60, item.grace_seconds - Math.round(lateMs / 1000));
    for (const sub of subsByOwner.get(item.owner_id)!) {
      const r = await sendWebPush(sub, payload, vapid, { ttl: Math.min(ttl, 24 * 3600), urgency: 'high' });
      if (r.ok) {
        sent++;
      } else {
        failed++;
        console.error('push falhou', r.status, r.error);
        if (r.gone) await sql`delete from rudge.push_subscriptions where id = ${sub.id}`;
        else await sql`update rudge.push_subscriptions set failures = failures + 1 where id = ${sub.id}`;
      }
    }
  }

  // limpeza
  await sql`delete from rudge.notifications where sent_at < now() - interval '3 days'`;
  await sql`delete from rudge.push_subscriptions where failures > 50`;
  return json({ ok: true, claimed: claimed.length, sent, skipped, failed });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  const route = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';

  try {
    if (route === 'dispatch') {
      const s = await secrets();
      if (!safeEqual(req.headers.get('x-cron-secret') ?? '', s.rudge_cron_secret ?? '')) return json({ error: 'não autorizado' }, 401);
      return await dispatch();
    }

    const owner = await ownerFrom(req);
    if (!owner) return json({ error: 'não autorizado' }, 401);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (route) {
      case 'sync':
        return await sync(owner, body);
      case 'subscribe':
        return await subscribe(owner, body);
      case 'unsubscribe':
        return await unsubscribe(owner, body);
      case 'action':
        return await action(owner, body);
      case 'test':
        return await test(owner, body);
      case 'ai':
        return await interpret(body);
      case 'status':
        return await status(owner, body);
      default:
        return json({ error: 'rota desconhecida' }, 404);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'erro interno' }, 500);
  }
});
