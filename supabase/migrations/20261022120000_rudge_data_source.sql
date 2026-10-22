-- Qual aparelho tem os dados editados mais recentemente (por dono).
-- Os dados ficam no aparelho; sem isso, a fila de um aparelho desatualizado
-- continuaria disparando lembretes antigos (horário velho, item já concluído).
create table if not exists rudge.owners (
  owner_id text primary key,
  data_device text,
  data_edited_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table rudge.owners enable row level security;
revoke all on rudge.owners from public, anon, authenticated;
