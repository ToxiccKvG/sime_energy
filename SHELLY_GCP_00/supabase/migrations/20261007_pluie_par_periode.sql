-- ============================================================
--  Pluie : valeur PAR PÉRIODE calculée à la collecte.
--
--  Le compteur de la station (shelly_cl.precipitation_mm) est un CUMUL depuis
--  l'installation : exporté tel quel, il donne un cumul partout. On garde ce
--  compteur (source brute, jamais modifiée) et on ajoute pluie_mm :
--    · shelly_cl.pluie_mm          = pluie depuis le relevé précédent du même
--                                    appareil (calculée à l'insertion, donc
--                                    disponible en temps réel). NULL au tout
--                                    premier relevé ; compteur qui chute
--                                    sous la moitié = remise à zéro → pluie = nouvelle valeur ;
--                                    petit recul = 0.
--    · shelly_cl_horaire.pluie_mm  = somme sur l'heure
--    · shelly_cl_journalier.pluie_mm = somme sur le jour
--  Station muette la nuit : la pluie tombée pendant le silence est comptée au
--  premier relevé qui suit.
-- ============================================================

alter table shelly_cl         add column if not exists pluie_mm float;
alter table shelly_cl_horaire add column if not exists pluie_mm float;

create or replace function fn_shelly_cl_pluie() returns trigger
language plpgsql as $$
declare
  prec float;
begin
  -- index (device_id, ts DESC) : lecture directe du relevé précédent
  select precipitation_mm into prec
  from shelly_cl
  where device_id = new.device_id
    and precipitation_mm is not null
    and ts <= new.ts
  order by ts desc
  limit 1;
  if prec is not null then
    -- Hausse = pluie. Petit recul (correction du capteur, ex. 259,1 → 258,4) = 0.
    -- Remise à zéro seulement si le compteur tombe sous la moitié de sa valeur.
    new.pluie_mm := round((case when new.precipitation_mm >= prec then new.precipitation_mm - prec
                                when new.precipitation_mm < prec * 0.5 then new.precipitation_mm
                                else 0 end)::numeric, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shelly_cl_pluie on shelly_cl;
create trigger trg_shelly_cl_pluie
  before insert on shelly_cl
  for each row
  when (new.precipitation_mm is not null)
  execute function fn_shelly_cl_pluie();

comment on column shelly_cl.pluie_mm is 'Pluie tombée depuis le relevé précédent (mm), dérivée du compteur cumulatif precipitation_mm.';
comment on column shelly_cl_horaire.pluie_mm is 'Pluie tombée dans l''heure (mm) = somme de shelly_cl.pluie_mm. precipitation_mm reste le CUMUL du compteur.';

-- Agrégation horaire : définition de production + colonne pluie_mm
CREATE OR REPLACE FUNCTION public.fn_aggregate_horaire_env(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    precipitation_mm, pluie_mm, moisture_alarm,
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
    max(precipitation_mm)                              AS precipitation_mm,
    sum(pluie_mm)                                      AS pluie_mm,
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
    pluie_mm               = excluded.pluie_mm,
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
$function$
;

-- Vue journalière : définition de production + colonne pluie_mm (ajoutée en fin)
create or replace view shelly_cl_journalier as
SELECT (date_trunc('day'::text, ts))::date AS jour,
    device_id,
    (array_agg(site ORDER BY ts DESC))[1] AS site,
    (array_agg(name ORDER BY ts DESC))[1] AS name,
    (array_agg(room ORDER BY ts DESC))[1] AS room,
    (array_agg(device_type ORDER BY ts DESC))[1] AS device_type,
    (array_agg(device_family ORDER BY ts DESC))[1] AS device_family,
    min(temperature) AS temp_min,
    max(temperature) AS temp_max,
    round((avg(temperature))::numeric, 1) AS temp_moy,
    min(humidity) AS hum_min,
    max(humidity) AS hum_max,
    round((avg(humidity))::numeric, 1) AS hum_moy,
    min(feels_like_c) AS ressenti_min,
    max(feels_like_c) AS ressenti_max,
    min(uv_index) AS uv_min,
    max(uv_index) AS uv_max,
    min(illuminance_lux) AS lux_min,
    max(illuminance_lux) AS lux_max,
    min(wind_speed_ms) AS vent_min_ms,
    max(wind_speed_ms) AS vent_max_ms,
    max(wind_gust_ms) AS rafale_max_ms,
    min(pressure_hpa) AS pression_min,
    max(pressure_hpa) AS pression_max,
    max(precipitation_mm) AS pluie_max_mm,
    min(dewpoint_c) AS rosee_min,
    max(dewpoint_c) AS rosee_max,
    min(power_w) AS power_min_w,
    max(power_w) AS power_max_w,
    round((avg(power_w))::numeric, 1) AS power_moy_w,
    min(voltage_v) AS voltage_min_v,
    max(voltage_v) AS voltage_max_v,
    min(battery_level) AS batterie_min_pct,
    min(signal_rssi) AS signal_min_dbm,
    max(signal_rssi) AS signal_max_dbm,
    count(*) AS nb_lectures,
    count(*) FILTER (WHERE (state = 'offline'::text)) AS nb_offline,
    round((sum(pluie_mm))::numeric, 1) AS pluie_mm
   FROM shelly_cl
  GROUP BY ((date_trunc('day'::text, ts))::date), device_id;

comment on column shelly_cl_journalier.pluie_mm is 'Pluie tombée dans la journée (mm). pluie_max_mm reste le CUMUL max du compteur.';
