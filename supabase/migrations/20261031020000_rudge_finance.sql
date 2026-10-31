-- Carteira: conexão com a Pluggy (Meu Pluggy) por conta Rudge.
-- O Client Secret fica no Vault (secret_id); o schema "rudge" não é exposto pela API REST.
create table if not exists rudge.finance_links (
  owner_id text primary key,
  item_ids text[] not null default '{}',
  client_id text,
  secret_id uuid,
  snapshot jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);

alter table rudge.finance_links enable row level security;
revoke all on rudge.finance_links from public, anon, authenticated;
