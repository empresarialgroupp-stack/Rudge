-- Rudge: dados do app na conta (antes ficavam só no aparelho).
-- Uma linha por conta com o estado atual (rev sobe a cada gravação; o app junta antes de gravar)
-- e cópias de segurança que só crescem: a última cópia de cada aparelho nunca é apagada.
create table if not exists rudge.user_state (
  owner_id text primary key,
  rev bigint not null default 0,
  data jsonb not null,
  edited_at bigint not null default 0,
  device_id text,
  updated_at timestamptz not null default now()
);

create table if not exists rudge.user_state_snapshots (
  id bigint generated always as identity primary key,
  owner_id text not null,
  device_id text not null,
  rev bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists user_state_snapshots_owner_idx on rudge.user_state_snapshots (owner_id, created_at desc);

alter table rudge.user_state enable row level security;
alter table rudge.user_state_snapshots enable row level security;
revoke all on rudge.user_state, rudge.user_state_snapshots from public, anon, authenticated;
