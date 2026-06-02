-- ============================================================
--  SHELLY_GCP_00 — Schéma Supabase
--  Mise à jour : 2026-04-21
--  Table de collecte : shelly_cl  (poll-shelly + webhook)
-- ============================================================


-- ============================================================
--  1. EXTENSIONS
-- ============================================================

create extension if not exists pg_cron;   -- Planification des tâches
create extension if not exists pg_net;    -- Appels HTTP depuis PostgreSQL


-- ============================================================
--  2. NOTE : Table de collecte = shelly_cl
--
--  La table shelly_cl est la seule table de collecte active.
--  Colonnes principales :
--    ts           timestamptz  — horodatage du poll
--    site         text         — "Ma Maison" | "Académie CER2E"
--    name         text         — Nom affiché dans l'app Shelly
--    room         text         — Pièce
--    device_id    text         — ID Shelly
--    device_type  text         — SHEM-3, SNPL-00112EU…
--    device_family text        — ENERGIE_3PH | ENERGIE_2PH | ENERGIE_1PH | LUMIERE | …
--    state        text         — on | off | offline
--    power_w      float        — Puissance totale W
--    p_a/p_b/p_c  float        — Puissance par phase W (3PH/2PH)
--    voltage_v    float        — Tension V (phase principale)
--    v_a/v_b/v_c  float        — Tension par phase V
--    current_a    float        — Courant A (phase principale)
--    i_a/i_b/i_c  float        — Courant par phase A
--    wh_counter   float        — Compteur énergie Wh (cumulatif)
--    wh_tot       float        — Énergie totale toutes phases Wh
--    wh_a/wh_b/wh_c float      — Énergie par phase Wh
--    temperature  float        — Température °C (capteurs env.)
--    humidity     float        — Humidité % (capteurs env.)
--    battery_level int         — Batterie % (capteurs BLU)
-- ============================================================


-- ============================================================
--  3. MIGRATIONS — colonnes ajoutées après création initiale
-- ============================================================

alter table shelly_cl add column if not exists battery_level integer;

-- Colonnes retour réseau (Wh cumulatifs par phase — jamais remis à 0)
alter table shelly_cl add column if not exists wh_ra   float;
alter table shelly_cl add column if not exists wh_rb   float;
alter table shelly_cl add column if not exists wh_rc   float;
alter table shelly_cl add column if not exists wh_rtot float;


-- ============================================================
--  4. PURGE AUTOMATIQUE (rétention 90 jours)
--
--  Exécuté chaque nuit à 3h00 UTC.
-- ============================================================

select cron.schedule(
  'purge-old-shelly-cl',
  '0 3 * * *',
  $$delete from shelly_cl where ts < now() - interval '90 days'$$
);


-- ============================================================
--  5. POLLING AUTOMATIQUE (toutes les minutes)
--
--  pg_cron appelle l'Edge Function poll-shelly via pg_net.
--  L'Edge Function interroge Shelly Cloud et insère dans shelly_cl.
-- ============================================================

-- Supprimer le job existant s'il existe (pour éviter les doublons)
select cron.unschedule('poll-shelly-every-minute');

-- Créer le job
select cron.schedule(
  'poll-shelly-every-minute',
  '* * * * *',
  format(
    $$select net.http_post(
        url     := 'https://amctayugahwhxwytqiqf.supabase.co/functions/v1/poll-shelly',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
    )$$,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzbnpmYXZreGt2ZHR5d3hyc3BrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg2NTY1OCwiZXhwIjoyMDkwNDQxNjU4fQ.giXLBVugKO66hgybEMoKqTlXg-tQfwRENVOLo9BFhgE'
  )
);


-- ============================================================
--  6. REQUÊTES DE MONITORING (à lancer manuellement dans l'éditeur SQL)
-- ============================================================

-- Nombre total de lignes et dernière insertion
-- select count(*) as total, max(ts) as derniere_insertion from shelly_cl;

-- Vérifier les dernières exécutions du cron
-- select * from cron.job_run_details order by start_time desc limit 10;

-- Appareils collectés dans les 5 dernières minutes, par site
-- select date_trunc('minute', ts) as minute, site, count(distinct device_id) as nb_appareils
-- from shelly_cl
-- where ts > now() - interval '5 minutes'
-- group by 1, 2
-- order by 1 desc, 2;

-- Détail des appareils d'un site (dernières 5 minutes)
-- select name, room, device_type, state, power_w, voltage_v, temperature, humidity, wh_counter, ts
-- from shelly_cl
-- where site = 'Ma Maison'
--   and ts > now() - interval '5 minutes'
-- order by room, name;

-- Qualité des données par appareil
-- select name, room, device_type,
--   count(*) as nb_lectures,
--   count(power_w)   as power_ok,
--   count(voltage_v) as voltage_ok,
--   count(temperature) as temp_ok,
--   count(humidity)  as hum_ok,
--   count(state)     as state_ok,
--   count(wh_counter) as energy_ok
-- from shelly_cl
-- where ts > now() - interval '5 minutes'
-- group by name, room, device_type
-- order by room, name;

-- ── Diagnostic power_w suspects (1-phase > 5 000 W) ─────────
-- select name, device_type, device_family,
--   max(power_w) as max_w, round(avg(power_w)::numeric,1) as avg_w, count(*) as nb
-- from shelly_cl
-- where device_family = 'ENERGIE_1PH' and power_w > 5000
-- group by name, device_type, device_family order by max_w desc;

-- ── Distribution power_w par famille d'appareil ──────────────
-- select device_family,
--   round(avg(power_w)::numeric,1) as avg_w,
--   max(power_w) as max_w,
--   count(*) as nb
-- from shelly_cl where power_w is not null
-- group by device_family order by max_w desc;


-- ============================================================
--  7. EXPORTS CSV (copier-coller dans l'éditeur SQL → bouton Export)
--
--  Table : shelly_cl
--  Format date : 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:MM:SS'
-- ============================================================


-- ── Export toutes les données d'une période ──────────────────────────────
-- select
--   ts, site, name, room, device_id, device_type, device_family, state,
--   power_w, voltage_v, current_a,
--   p_a, p_b, p_c,
--   v_a, v_b, v_c,
--   i_a, i_b, i_c,
--   wh_counter, wh_tot, wh_a, wh_b, wh_c,
--   temperature, humidity
-- from shelly_cl
-- where ts between '2026-04-01' and '2026-04-20'
-- order by ts desc;


-- ── Export par site ───────────────────────────────────────────────────────
-- select
--   ts, name, room, device_type, state,
--   power_w, voltage_v, wh_counter,
--   p_a, p_b, p_c,
--   temperature, humidity
-- from shelly_cl
-- where site = 'Académie CER2E'           -- ou 'Ma Maison'
--   and ts between '2026-04-01' and '2026-04-20'
-- order by ts desc, room, name;


-- ── Export par appareil ───────────────────────────────────────────────────
-- select
--   ts, site, name, room, device_type, state,
--   power_w, voltage_v, wh_counter, temperature, humidity
-- from shelly_cl
-- where name = 'PV_BUILDING COMMUNAL'     -- remplace par le nom voulu
--   and ts between '2026-04-01' and '2026-04-20'
-- order by ts desc;


-- ── Export compteurs d'énergie 3-phases (SHEM-3 / SPEM) ──────────────────
-- select
--   ts, site, name, room, device_type,
--   power_w, p_a, p_b, p_c,
--   v_a, v_b, v_c,
--   wh_counter, wh_tot, wh_a, wh_b, wh_c
-- from shelly_cl
-- where device_type in ('SHEM-3', 'SPEM-003CEBEU', 'SPEM-003CEBEU400', 'SPEM-002CEBEU50')
--   and ts between '2026-04-01' and '2026-04-20'
-- order by ts desc, name;


-- ── Export capteurs environnementaux (température / humidité / porte) ────
-- select
--   ts, site, name, room, device_type,
--   state, temperature, humidity, battery_level
-- from shelly_cl
-- where device_type in ('SBHT-003C', 'SBDW-002C', 'SHGS-1')
--   and ts between '2026-04-01' and '2026-04-20'
-- order by ts desc;


-- ── Export dernières 24 heures ────────────────────────────────────────────
-- select
--   ts, site, name, room, device_type, state,
--   power_w, voltage_v, wh_counter,
--   p_a, p_b, p_c,
--   temperature, humidity, battery_level
-- from shelly_cl
-- where ts > now() - interval '24 hours'
-- order by ts desc, site, room, name;


-- ── Export dernière semaine ───────────────────────────────────────────────
-- select
--   ts, site, name, room, device_type, state,
--   power_w, voltage_v, wh_counter,
--   p_a, p_b, p_c,
--   temperature, humidity, battery_level
-- from shelly_cl
-- where ts > now() - interval '7 days'
-- order by ts desc, site, room, name;


-- ── Recréer shelly_cl_horaire avec wh_inj depuis wh_rtot ─────────────────
-- À exécuter dans l'éditeur SQL Supabase après avoir ajouté wh_ra/rb/rc/rtot
-- et redéployé l'Edge Function poll-shelly.
--
-- create or replace view shelly_cl_horaire as
-- select
--   date_trunc('hour', ts)                       as ts_heure,
--   site, device_id, name, device_family,
--   round(sum(greatest(0,
--     coalesce(wh_tot,0) - lag(coalesce(wh_tot,0)) over w
--   ))::numeric, 4)                               as wh_conso,
--   round(sum(greatest(0,
--     coalesce(wh_rtot,0) - lag(coalesce(wh_rtot,0)) over w
--   ))::numeric, 4)                               as wh_inj,
--   round(avg(power_w)::numeric, 2)               as power_w_moy,
--   round(max(power_w)::numeric, 2)               as power_w_max,
--   round(avg(p_a)::numeric, 2)                   as p_a_moy,
--   round(avg(p_b)::numeric, 2)                   as p_b_moy,
--   round(avg(p_c)::numeric, 2)                   as p_c_moy,
--   round(avg(v_a)::numeric, 2)                   as v_a_moy,
--   round(avg(v_b)::numeric, 2)                   as v_b_moy,
--   round(avg(v_c)::numeric, 2)                   as v_c_moy,
--   round(avg(voltage_v)::numeric, 2)             as voltage_v_moy,
--   count(*)                                      as nb_mesures
-- from shelly_cl
-- window w as (partition by device_id order by ts)
-- group by 1,2,3,4,5;

-- ── Moyennes horaires par appareil sur une période ────────────────────────
-- select
--   date_trunc('hour', ts) as heure,
--   site, name, room, device_type,
--   round(avg(power_w)::numeric, 2) as power_moy_w,
--   round(avg(p_a)::numeric, 2)     as pa_moy_w,
--   round(avg(p_b)::numeric, 2)     as pb_moy_w,
--   round(avg(p_c)::numeric, 2)     as pc_moy_w,
--   round(avg(temperature)::numeric, 1) as temp_moy_c,
--   round(avg(humidity)::numeric, 1)    as hum_moy_pct
-- from shelly_cl
-- where ts between '2026-04-01' and '2026-04-20'
-- group by 1, 2, 3, 4, 5
-- order by 1 desc, 2, 3;
