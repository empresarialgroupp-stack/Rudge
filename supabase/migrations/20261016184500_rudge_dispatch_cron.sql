-- Dispara os avisos vencidos a cada minuto (URL e segredo ficam no Vault).
-- Segredos usados (criados com vault.create_secret, valores fora do repositório):
--   rudge_function_url, rudge_cron_secret, rudge_vapid_public, rudge_vapid_private,
--   rudge_vapid_subject, rudge_token_sha256
select cron.schedule(
  'rudge-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rudge_function_url') || '/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rudge_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Limpa o histórico de respostas HTTP do pg_net diariamente
select cron.schedule('rudge-net-cleanup', '17 3 * * *', $$ delete from net._http_response where created < now() - interval '1 day' $$);
