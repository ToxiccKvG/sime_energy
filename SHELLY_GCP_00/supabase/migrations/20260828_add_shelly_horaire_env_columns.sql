-- ============================================================
--  Agrégation horaire des capteurs environnementaux
--
--  Problème : shelly_cl_horaire ne portait que des colonnes d'énergie
--  (wh_conso, wh_inj, p_*_moy, v_*_moy…). Les capteurs y ont pourtant
--  une ligne par heure — mais vide. Or la granularité « horaire » est
--  celle de l'onglet Analyse : toute analyse mixte énergie + capteurs
--  affichait donc la station météo et les H&T comme des lignes à zéro,
--  sans température ni humidité, alors que shelly_cl les contient.
--
--  Ce script ajoute les agrégats environnementaux et la fonction qui
--  les remplit. Elle est volontairement SÉPARÉE de fn_aggregate_horaire :
--  elle ne touche aucune colonne d'énergie et ne peut donc pas régresser
--  l'agrégation existante.
-- ============================================================

-- ── 1. Colonnes ─────────────────────────────────────────────────────────
alter table shelly_cl_horaire add column if not exists temperature_moy        float;
alter table shelly_cl_horaire add column if not exists temperature_min        float;
alter table shelly_cl_horaire add column if not exists temperature_max        float;
alter table shelly_cl_horaire add column if not exists humidity_moy           float;
alter table shelly_cl_horaire add column if not exists feels_like_c_moy       float;
alter table shelly_cl_horaire add column if not exists dewpoint_c_moy         float;
alter table shelly_cl_horaire add column if not exists uv_index_moy           float;
alter table shelly_cl_horaire add column if not exists uv_index_max           float;
alter table shelly_cl_horaire add column if not exists illuminance_lux_moy    float;
alter table shelly_cl_horaire add column if not exists illuminance_lux_max    float;
alter table shelly_cl_horaire add column if not exists pressure_hpa_moy       float;
alter table shelly_cl_horaire add column if not exists pressure_slope_dernier text;
alter table shelly_cl_horaire add column if not exists precipitation_mm       float;
alter table shelly_cl_horaire add column if not exists moisture_alarm         boolean;
alter table shelly_cl_horaire add column if not exists wind_speed_ms_moy      float;
alter table shelly_cl_horaire add column if not exists wind_gust_ms_max       float;
alter table shelly_cl_horaire add column if not exists wind_direction_deg_moy float;
alter table shelly_cl_horaire add column if not exists device_temp_c_moy      float;
alter table shelly_cl_horaire add column if not exists tilt_angle_moy         float;
alter table shelly_cl_horaire add column if not exists concentration_ppm_moy  float;
alter table shelly_cl_horaire add column if not exists battery_level_min      float;
alter table shelly_cl_horaire add column if not exists battery_voltage_v_moy  float;
alter table shelly_cl_horaire add column if not exists signal_rssi_moy        float;
alter table shelly_cl_horaire add column if not exists state_dernier          text;
alter table shelly_cl_horaire add column if not exists nb_mesures_env         int;

comment on column shelly_cl_horaire.nb_mesures_env is
  'Nombre de relevés DISTINCTS du capteur dans l''heure (measured_at, sinon ts). Un capteur endormi peut être relu 60 fois pour une seule mesure réelle : cette colonne permet de le voir.';
comment on column shelly_cl_horaire.wind_direction_deg_moy is
  'Moyenne circulaire (atan2 des composantes) — une moyenne arithmétique donnerait 180° pour deux vents à 350° et 10°.';

-- ── 2. Fonction d'agrégation environnementale ───────────────────────────
--
--  Idempotente (INSERT … ON CONFLICT DO UPDATE) et additive : les colonnes
--  d'énergie ne figurent pas dans le DO UPDATE, fn_aggregate_horaire reste
--  seule maîtresse de wh_conso & co.
--
create or replace function fn_aggregate_horaire_env(
  p_since timestamptz default null,
  p_until timestamptz default null
) returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  if p_since is null then p_since := date_trunc('hour', now() - interval '2 hours'); end if;
  if p_until is null then p_until := date_trunc('hour', now()) + interval '1 hour'; end if;

  insert into shelly_cl_horaire (
    ts_heure, site, device_id, name, device_type, device_family,
    temperature_moy, temperature_min, temperature_max,
    humidity_moy, feels_like_c_moy, dewpoint_c_moy,
    uv_index_moy, uv_index_max,
    illuminance_lux_moy, illuminance_lux_max,
    pressure_hpa_moy, pressure_slope_dernier,
    precipitation_mm, moisture_alarm,
    wind_speed_ms_moy, wind_gust_ms_max, wind_direction_deg_moy,
    device_temp_c_moy, tilt_angle_moy, concentration_ppm_moy,
    battery_level_min, battery_voltage_v_moy, signal_rssi_moy,
    state_dernier, nb_mesures_env
  )
  select
    date_trunc('hour', ts at time zone 'UTC')          as ts_heure,
    max(site)                                          as site,
    device_id,
    max(name)                                          as name,
    max(device_type)                                   as device_type,
    max(device_family)                                 as device_family,
    round(avg(temperature)::numeric, 2)                as temperature_moy,
    min(temperature)                                   as temperature_min,
    max(temperature)                                   as temperature_max,
    round(avg(humidity)::numeric, 2)                   as humidity_moy,
    round(avg(feels_like_c)::numeric, 2)               as feels_like_c_moy,
    round(avg(dewpoint_c)::numeric, 2)                 as dewpoint_c_moy,
    round(avg(uv_index)::numeric, 2)                   as uv_index_moy,
    max(uv_index)                                      as uv_index_max,
    round(avg(illuminance_lux)::numeric, 1)            as illuminance_lux_moy,
    max(illuminance_lux)                               as illuminance_lux_max,
    round(avg(pressure_hpa)::numeric, 2)               as pressure_hpa_moy,
    (array_agg(pressure_slope order by ts desc)
       filter (where pressure_slope is not null))[1]   as pressure_slope_dernier,
    max(precipitation_mm)                              as precipitation_mm,
    bool_or(moisture_alarm)                            as moisture_alarm,
    round(avg(wind_speed_ms)::numeric, 2)              as wind_speed_ms_moy,
    max(wind_gust_ms)                                  as wind_gust_ms_max,
    -- Moyenne circulaire, ramenée dans [0,360[
    case when count(wind_direction_deg) = 0 then null else
      mod((degrees(atan2(
            avg(sin(radians(wind_direction_deg))),
            avg(cos(radians(wind_direction_deg)))
          )) + 360)::numeric, 360::numeric)
    end                                                as wind_direction_deg_moy,
    round(avg(device_temp_c)::numeric, 2)              as device_temp_c_moy,
    round(avg(tilt_angle)::numeric, 2)                 as tilt_angle_moy,
    round(avg(concentration_ppm)::numeric, 2)          as concentration_ppm_moy,
    min(battery_level)                                 as battery_level_min,
    round(avg(battery_voltage_v)::numeric, 3)          as battery_voltage_v_moy,
    round(avg(signal_rssi)::numeric, 1)                as signal_rssi_moy,
    (array_agg(state order by ts desc)
       filter (where state is not null))[1]            as state_dernier,
    count(distinct coalesce(measured_at, ts))          as nb_mesures_env
  from shelly_cl
  where ts >= p_since
    and ts <  p_until
    -- Seules les lignes portant au moins une grandeur de capteur : inutile de
    -- créer des lignes vides pour les compteurs d'énergie.
    and num_nonnulls(
          temperature, humidity, feels_like_c, dewpoint_c, uv_index,
          illuminance_lux, pressure_hpa, precipitation_mm, wind_speed_ms,
          wind_gust_ms, wind_direction_deg, device_temp_c, tilt_angle,
          concentration_ppm, battery_level, battery_voltage_v, signal_rssi,
          state, moisture_alarm, pressure_slope
        ) > 0
  -- Groupement identique à fn_aggregate_horaire (site agrégé, non groupant) :
  -- un appareil déplacé de site en cours d'heure produirait sinon deux lignes
  -- pour la même clé (ts_heure, device_id) et ferait échouer le ON CONFLICT.
  group by 1, 3
  on conflict (ts_heure, device_id)
  do update set
    name                   = coalesce(shelly_cl_horaire.name, excluded.name),
    device_type            = coalesce(shelly_cl_horaire.device_type, excluded.device_type),
    device_family          = coalesce(shelly_cl_horaire.device_family, excluded.device_family),
    temperature_moy        = excluded.temperature_moy,
    temperature_min        = excluded.temperature_min,
    temperature_max        = excluded.temperature_max,
    humidity_moy           = excluded.humidity_moy,
    feels_like_c_moy       = excluded.feels_like_c_moy,
    dewpoint_c_moy         = excluded.dewpoint_c_moy,
    uv_index_moy           = excluded.uv_index_moy,
    uv_index_max           = excluded.uv_index_max,
    illuminance_lux_moy    = excluded.illuminance_lux_moy,
    illuminance_lux_max    = excluded.illuminance_lux_max,
    pressure_hpa_moy       = excluded.pressure_hpa_moy,
    pressure_slope_dernier = excluded.pressure_slope_dernier,
    precipitation_mm       = excluded.precipitation_mm,
    moisture_alarm         = excluded.moisture_alarm,
    wind_speed_ms_moy      = excluded.wind_speed_ms_moy,
    wind_gust_ms_max       = excluded.wind_gust_ms_max,
    wind_direction_deg_moy = excluded.wind_direction_deg_moy,
    device_temp_c_moy      = excluded.device_temp_c_moy,
    tilt_angle_moy         = excluded.tilt_angle_moy,
    concentration_ppm_moy  = excluded.concentration_ppm_moy,
    battery_level_min      = excluded.battery_level_min,
    battery_voltage_v_moy  = excluded.battery_voltage_v_moy,
    signal_rssi_moy        = excluded.signal_rssi_moy,
    state_dernier          = excluded.state_dernier,
    nb_mesures_env         = excluded.nb_mesures_env;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 3. Planification — H+07, après fn_aggregate_horaire (H+05) ──────────
select cron.unschedule('aggregate-shelly-cl-horaire-env')
where exists (select 1 from cron.job where jobname = 'aggregate-shelly-cl-horaire-env');

select cron.schedule(
  'aggregate-shelly-cl-horaire-env',
  '7 * * * *',
  $$select fn_aggregate_horaire_env()$$
);

-- ── 4. Backfill de l'historique conservé dans shelly_cl ─────────────────
--
--  À lancer une fois, par tranches pour rester sous le statement_timeout
--  (chaque appel est idempotent, ré-exécutable sans risque) :
--
--  select fn_aggregate_horaire_env(now() - interval '15 days', now());
--  select fn_aggregate_horaire_env(now() - interval '30 days', now() - interval '15 days');
--  select fn_aggregate_horaire_env(now() - interval '45 days', now() - interval '30 days');
--  select fn_aggregate_horaire_env(now() - interval '60 days', now() - interval '45 days');
--  select fn_aggregate_horaire_env(now() - interval '90 days', now() - interval '60 days');

-- ── 5. Vérification ────────────────────────────────────────────────────
--
--  select ts_heure, name, temperature_moy, humidity_moy, nb_mesures_env
--    from shelly_cl_horaire
--   where device_family = 'CAPTEUR_ENV' and temperature_moy is not null
--   order by ts_heure desc limit 20;
