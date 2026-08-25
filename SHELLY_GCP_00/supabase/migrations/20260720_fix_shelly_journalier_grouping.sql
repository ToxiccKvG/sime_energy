-- ============================================================
--  Fix : shelly_cl_journalier retournait plusieurs lignes pour un
--  même jour quand site/room/device_type changeait en cours de
--  journée (ex. 2026-07-09, bascule du compte Donsin — cf.
--  project_shelly_accounts memory). On regroupe désormais par
--  device_id + jour uniquement ; les colonnes descriptives
--  prennent la valeur la plus récente de la journée (max(ts)).
-- ============================================================

create or replace view shelly_cl_journalier as
select
  date_trunc('day', ts)::date as jour,
  device_id,
  (array_agg(site       order by ts desc))[1] as site,
  (array_agg(name       order by ts desc))[1] as name,
  (array_agg(room       order by ts desc))[1] as room,
  (array_agg(device_type   order by ts desc))[1] as device_type,
  (array_agg(device_family order by ts desc))[1] as device_family,

  min(temperature) as temp_min, max(temperature) as temp_max, round(avg(temperature)::numeric,1) as temp_moy,
  min(humidity)    as hum_min,  max(humidity)    as hum_max,  round(avg(humidity)::numeric,1)    as hum_moy,
  min(feels_like_c) as ressenti_min, max(feels_like_c) as ressenti_max,

  min(uv_index) as uv_min, max(uv_index) as uv_max,
  min(illuminance_lux) as lux_min, max(illuminance_lux) as lux_max,
  min(wind_speed_ms) as vent_min_ms, max(wind_speed_ms) as vent_max_ms, max(wind_gust_ms) as rafale_max_ms,
  min(pressure_hpa) as pression_min, max(pressure_hpa) as pression_max,
  max(precipitation_mm) as pluie_max_mm,
  min(dewpoint_c) as rosee_min, max(dewpoint_c) as rosee_max,

  min(power_w) as power_min_w, max(power_w) as power_max_w, round(avg(power_w)::numeric,1) as power_moy_w,
  min(voltage_v) as voltage_min_v, max(voltage_v) as voltage_max_v,
  min(battery_level) as batterie_min_pct,
  min(signal_rssi) as signal_min_dbm, max(signal_rssi) as signal_max_dbm,

  count(*) as nb_lectures,
  count(*) filter (where state = 'offline') as nb_offline
from shelly_cl
group by 1,2;

comment on view shelly_cl_journalier is 'Min/max/moyenne par appareil et par jour, calculé depuis shelly_cl (poll/minute) — remplace les endpoints /statistics/* de l''API Shelly Cloud, absents pour les capteurs BLU (404 confirmé sur station météo Donsin). Groupé par device_id+jour uniquement (fix 2026-07-20) : site/room/type pris à la valeur la plus récente du jour pour éviter les doublons lors des bascules de compte.';
