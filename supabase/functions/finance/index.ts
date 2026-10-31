// Rudge — Carteira: sincroniza contas e cartões pela Pluggy (Meu Pluggy, uso pessoal gratuito).
//
// Rotas (POST):
//   /link    salva as credenciais da Pluggy (Client ID/Secret) e os Item IDs do Meu Pluggy
//   /cards   contas e transações dos últimos ~2 meses (cache de 20 min no servidor)
//   /unlink  apaga a conexão desta conta
//   /config  diz se as credenciais da Pluggy estão nos secrets da função
//   /connect-token  token de 30 min para o app abrir o widget Pluggy Connect
//
// Autenticação: header x-rudge-token (token do aparelho emitido pela função "rudge" em /device).
// O Client Secret fica no Vault do Supabase; a tabela fica no schema "rudge", fora da API REST.
// Também aceita PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET como secrets da função (equivalente ao
// process.env): com eles, o app só abre o widget, e as credenciais nunca passam pelo navegador.

import postgres from 'npm:postgres@3.4.5';
import { mapAccount, type PluggyAccount, type PluggyItem, type PluggyTransaction } from './map.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 });
type Json = Parameters<typeof sql.json>[0];
const API = 'https://api.pluggy.ai';
const CACHE_MS = 20 * 60_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-rudge-token, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ownerFrom(req: Request): Promise<string | null> {
  const token = req.headers.get('x-rudge-token');
  if (!token || token.length > 200) return null;
  const [dev] = await sql<{ owner_id: string }[]>`select owner_id from rudge.device_tokens where token_sha256 = ${await sha256Hex(token)}`;
  return dev?.owner_id ?? null;
}

interface Link {
  owner_id: string;
  item_ids: string[];
  client_id: string | null;
  secret_id: string | null;
  snapshot: unknown;
  fetched_at: string | null;
}

async function credentials(link: Link) {
  const envId = Deno.env.get('PLUGGY_CLIENT_ID');
  const envSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };
  if (!link.client_id || !link.secret_id) return null;
  const [s] = await sql<{ decrypted_secret: string }[]>`select decrypted_secret from vault.decrypted_secrets where id = ${link.secret_id}`;
  return s ? { clientId: link.client_id, clientSecret: s.decrypted_secret } : null;
}

async function apiKey(clientId: string, clientSecret: string) {
  const res = await fetch(`${API}/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Client ID ou Client Secret inválido.' : `Pluggy respondeu ${res.status}.`);
  return ((await res.json()) as { apiKey: string }).apiKey;
}

async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { 'X-API-KEY': key } });
  if (!res.ok) throw new Error(`Pluggy ${path.split('?')[0]}: ${res.status}`);
  return (await res.json()) as T;
}

const list = <T>(r: T[] | { results?: T[] }) => (Array.isArray(r) ? r : (r.results ?? []));

async function transactions(key: string, accountId: string, from: string) {
  const out: PluggyTransaction[] = [];
  for (let page = 1; page <= 6; page++) {
    const r = await get<{ results: PluggyTransaction[]; totalPages?: number }>(key, `/transactions?accountId=${accountId}&from=${from}&pageSize=500&page=${page}`);
    out.push(...list(r));
    if (!r.totalPages || page >= r.totalPages) break;
  }
  return out;
}

/** Busca tudo na Pluggy: itens → contas → transações desde o início do mês passado. */
async function fetchAll(link: Link, given?: { clientId: string; clientSecret: string }) {
  const cred = given ?? (await credentials(link));
  if (!cred) throw new Error('Credenciais da Pluggy não configuradas.');
  const key = await apiKey(cred.clientId, cred.clientSecret);
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const accounts = [];
  const errors: string[] = [];
  for (const itemId of link.item_ids) {
    try {
      const item = await get<PluggyItem>(key, `/items/${itemId}`);
      for (const a of list(await get<PluggyAccount[] | { results: PluggyAccount[] }>(key, `/accounts?itemId=${itemId}`))) {
        accounts.push(mapAccount(a, item, await transactions(key, a.id, from)));
      }
    } catch (e) {
      errors.push(`${itemId.slice(0, 8)}…: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { accounts, errors, at: Date.now() };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function link(owner: string, body: Record<string, unknown>) {
  const itemIds = (Array.isArray(body.itemIds) ? body.itemIds : String(body.itemIds ?? '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter((x) => UUID.test(x));
  if (!itemIds.length) return json({ error: 'Informe ao menos um Item ID válido.' }, 400);
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim().slice(0, 100) : '';
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim().slice(0, 200) : '';

  const [prev] = await sql<Link[]>`select * from rudge.finance_links where owner_id = ${owner}`;
  // widget: cada conexão traz um item novo, que se soma aos já salvos
  if (body.append && prev) itemIds.push(...prev.item_ids.filter((x) => !itemIds.includes(x)));
  itemIds.splice(5);
  const next: Link = { owner_id: owner, item_ids: itemIds, client_id: clientId || prev?.client_id || null, secret_id: prev?.secret_id ?? null, snapshot: null, fetched_at: null };

  // valida antes de gravar qualquer coisa: credenciais e itens precisam responder
  const given = clientId && clientSecret ? { clientId, clientSecret } : undefined;
  const snap = await fetchAll(next, given).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  if ('error' in snap) return json({ error: snap.error }, 400);
  if (!snap.accounts.length) return json({ error: `Nenhuma conta encontrada. ${snap.errors.join(' ')}`.trim() }, 400);

  let secretId = next.secret_id;
  if (clientSecret) {
    if (secretId) await sql`select vault.update_secret(${secretId}::uuid, ${clientSecret})`;
    else [{ id: secretId }] = await sql<{ id: string }[]>`select vault.create_secret(${clientSecret}, ${`rudge_pluggy_${owner}_${Date.now()}`}) as id`;
  }

  await sql`insert into rudge.finance_links (owner_id, item_ids, client_id, secret_id, snapshot, fetched_at)
    values (${owner}, ${itemIds}, ${next.client_id}, ${secretId}, ${sql.json(snap as unknown as Json)}, now())
    on conflict (owner_id) do update set item_ids = excluded.item_ids, client_id = excluded.client_id, secret_id = excluded.secret_id,
      snapshot = excluded.snapshot, fetched_at = excluded.fetched_at`;
  return json({ linked: true, ...snap });
}

/** Mesmo papel do app/api/connect-token do exemplo da Pluggy em Next.js. */
async function connectToken(owner: string) {
  const [l] = await sql<Link[]>`select * from rudge.finance_links where owner_id = ${owner}`;
  const cred = await credentials(l ?? ({ client_id: null, secret_id: null } as Link));
  if (!cred) return json({ error: 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nos secrets da função.' }, 412);
  const res = await fetch(`${API}/connect_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': await apiKey(cred.clientId, cred.clientSecret) },
    body: JSON.stringify({ clientUserId: owner }),
  });
  if (!res.ok) return json({ error: `Pluggy respondeu ${res.status}.` }, 502);
  return json({ accessToken: ((await res.json()) as { accessToken: string }).accessToken });
}

async function config(owner: string) {
  const [l] = await sql<{ n: number }[]>`select cardinality(item_ids) as n from rudge.finance_links where owner_id = ${owner}`;
  return json({ serverCredentials: !!(Deno.env.get('PLUGGY_CLIENT_ID') && Deno.env.get('PLUGGY_CLIENT_SECRET')), items: l?.n ?? 0 });
}

async function cards(owner: string, body: Record<string, unknown>) {
  const [l] = await sql<Link[]>`select * from rudge.finance_links where owner_id = ${owner}`;
  if (!l) return json({ linked: false });
  const fresh = l.fetched_at && Date.now() - Date.parse(l.fetched_at) < CACHE_MS;
  if (fresh && !body.force) return json({ linked: true, cached: true, ...(l.snapshot as object) });
  try {
    const snap = await fetchAll(l);
    await sql`update rudge.finance_links set snapshot = ${sql.json(snap as unknown as Json)}, fetched_at = now() where owner_id = ${owner}`;
    return json({ linked: true, ...snap });
  } catch (e) {
    // Pluggy fora do ar: devolve o último retrato salvo
    return json({ linked: true, stale: true, error: e instanceof Error ? e.message : String(e), ...((l.snapshot as object) ?? { accounts: [] }) });
  }
}

async function unlink(owner: string) {
  const [l] = await sql<Link[]>`delete from rudge.finance_links where owner_id = ${owner} returning secret_id`;
  if (l?.secret_id) await sql`delete from vault.secrets where id = ${l.secret_id}`;
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);
  const route = new URL(req.url).pathname.split('/').pop();
  try {
    const owner = await ownerFrom(req);
    if (!owner) return json({ error: 'não autorizado' }, 401);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (route === 'link') return await link(owner, body);
    if (route === 'cards') return await cards(owner, body);
    if (route === 'unlink') return await unlink(owner);
    if (route === 'connect-token') return await connectToken(owner);
    if (route === 'config') return await config(owner);
    return json({ error: 'rota desconhecida' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'erro interno' }, 500);
  }
});
