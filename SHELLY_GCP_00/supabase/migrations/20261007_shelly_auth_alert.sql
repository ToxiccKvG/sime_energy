-- Alerte « clé Shelly révoquée » : mémorise l'état des alertes pour ne pas spammer.
-- Alimentée uniquement par l'Edge Function alert-shelly-auth (service_role).
create table if not exists shelly_alert_state (
  site       text primary key,
  first_seen timestamptz not null default now(),
  last_sent  timestamptz
);
alter table shelly_alert_state enable row level security;
-- Aucune policy : seul service_role (bypass RLS) y accède.
revoke all on shelly_alert_state from anon, authenticated;

select cron.unschedule('alert-shelly-auth-every-5min')
where exists (select 1 from cron.job where jobname = 'alert-shelly-auth-every-5min');

select cron.schedule(
  'alert-shelly-auth-every-5min',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://amctayugahwhxwytqiqf.supabase.co/functions/v1/alert-shelly-auth',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
  )$$
);
