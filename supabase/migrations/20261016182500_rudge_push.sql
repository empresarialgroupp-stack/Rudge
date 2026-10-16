-- Rudge: notificações push com o app fechado.
-- Tudo fica no schema "rudge", que NÃO é exposto pela API REST: só a Edge Function
-- (conexão direta ao Postgres) lê e grava aqui.
-- owner_id já prepara o modelo multiusuário (SaaS); hoje há um único dono: 'owner'.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists rudge;
revoke all on schema rudge from public, anon, authenticated;

-- Assinaturas de push (uma por navegador/aparelho)
create table rudge.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner',
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failures integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on rudge.push_subscriptions (owner_id);

-- Fila de avisos sincronizada pelo app (próximos 30 dias) e disparada pelo cron
create table rudge.notifications (
  id bigint generated always as identity primary key,
  owner_id text not null default 'owner',
  device_id text not null,
  key text not null,
  fire_at timestamptz not null,
  grace_seconds integer not null default 3600,
  payload jsonb not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, device_id, key)
);
create index notifications_due_idx on rudge.notifications (fire_at) where sent_at is null;
create index notifications_owner_key_idx on rudge.notifications (owner_id, key);

-- Defesa em profundidade: RLS ligado e sem políticas (nenhum acesso via API)
alter table rudge.push_subscriptions enable row level security;
alter table rudge.notifications enable row level security;
revoke all on all tables in schema rudge from public, anon, authenticated;
