-- Rudge: lista de espera da landing (rudge.vercel.app/site/).
-- Só acrescenta: tabela nova no schema rudge, fechada para leitura,
-- e uma função pública que só insere (o mesmo e-mail não entra duas vezes).
create table if not exists rudge.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

alter table rudge.waitlist enable row level security;
revoke all on rudge.waitlist from public, anon, authenticated;

-- Entra na fila e devolve a posição (número do membro). Se o e-mail já está na fila,
-- devolve a posição que ele já tinha, sem duplicar.
create or replace function public.rudge_join_waitlist(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id bigint;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  insert into rudge.waitlist (email) values (v_email)
  on conflict (email) do nothing
  returning id into v_id;

  if v_id is null then
    select w.id into v_id from rudge.waitlist w where w.email = v_email;
  end if;

  return (select count(*)::integer from rudge.waitlist w where w.id <= v_id);
end;
$$;

revoke all on function public.rudge_join_waitlist(text) from public;
grant execute on function public.rudge_join_waitlist(text) to anon, authenticated;
