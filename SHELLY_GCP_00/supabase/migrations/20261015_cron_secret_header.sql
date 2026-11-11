-- ============================================================
--  Crons → Edge Functions : en-tête x-cron-secret — 2026-10-15
-- ============================================================
--  poll-shelly et alert-shelly-auth sont déployées sans vérification
--  JWT (pg_cron n'a pas de session) : n'importe qui pouvait les
--  déclencher. Elles exigent désormais l'en-tête x-cron-secret, égal
--  au secret Edge Functions CRON_SECRET.
--
--  Le secret n'est pas écrit ici ni dans cron.job : il est lu dans le
--  Vault (vault.decrypted_secrets, nom « cron_secret ») à chaque appel.
--  Prérequis (hors migration, la valeur ne va pas dans git) :
--    select vault.create_secret('<valeur>', 'cron_secret', '...');
--    supabase secrets set CRON_SECRET=<valeur>
--  L'ancien en-tête Authorization (clé en clair) est retiré.
-- ============================================================

select cron.alter_job(
  (select jobid from cron.job where jobname = 'poll-shelly-every-minute'),
  command := $cmd$
    select net.http_post(
      url     := 'https://amctayugahwhxwytqiqf.supabase.co/functions/v1/poll-shelly',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'alert-shelly-auth-every-5min'),
  command := $cmd$
    select net.http_post(
      url     := 'https://amctayugahwhxwytqiqf.supabase.co/functions/v1/alert-shelly-auth',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $cmd$
);
