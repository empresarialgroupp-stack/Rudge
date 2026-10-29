-- Rudge: avisos presos à conta Rudge (Supabase Auth), a mesma do Rudge Music.
-- O app entra com a conta e troca o JWT (que vence em 1 hora) por um token de aparelho
-- de longa duração: o service worker usa esse token com o app fechado (Concluir/Adiar).
-- Só o hash do token fica no banco. owner_id passa a ser o id do usuário (auth.users.id).

create table if not exists rudge.device_tokens (
  token_sha256 text primary key,
  owner_id text not null,
  device_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (owner_id, device_id)
);
create index if not exists device_tokens_owner_idx on rudge.device_tokens (owner_id);

-- Dono antigo ('owner', senha única) já migrado para uma conta: o token antigo deixa de valer.
create table if not exists rudge.legacy_claim (
  id boolean primary key default true check (id),
  owner_id text not null,
  claimed_at timestamptz not null default now()
);

alter table rudge.device_tokens enable row level security;
alter table rudge.legacy_claim enable row level security;
revoke all on rudge.device_tokens, rudge.legacy_claim from public, anon, authenticated;
