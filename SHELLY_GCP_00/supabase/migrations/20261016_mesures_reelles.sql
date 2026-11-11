-- ============================================================
--  Heures « présentes » mais vides : nb_mesures_reelles — 2026-10-16
--
--  Défaut trouvé : quand un appareil est injoignable, la collecte écrit
--  quand même une ligne (toutes les 10 min) avec state = 'offline' et
--  toutes les valeurs à NULL. fn_aggregate_horaire comptait ces lignes
--  dans nb_mesures : une heure sans aucune mesure devenait une heure
--  « présente à 0 kWh » (~5 % des heures, 11 800 h ; Académie M1 en août :
--  144 lignes vides par jour). Conséquences : consommation 0 au lieu de
--  « non mesurée », appareils hors ligne vus présents, coupures fantômes.
--
--  Correction, sans toucher à shelly_cl :
--   1. colonne nb_mesures_reelles = lignes qui portent une vraie mesure
--      (une valeur, ou un état autre que 'offline' pour un relais / une
--      porte) ; nb_mesures garde son sens (toutes les lignes) ;
--   2. fn_aggregate_horaire la calcule désormais à chaque passage ;
--   3. fn_reprise_mesures_reelles(début, fin) la recalcule sur l'historique,
--      par tranche (shelly_cl : ~10 M lignes, 3,4 Go) ;
--   4. la tâche cron « aggregate-shelly-hourly » est désactivée : elle
--      appelait une ancienne fonction qui échoue à chaque heure
--      (« column "wh_counter" does not exist »), sans rien écrire. Elle
--      reste définie : cron.schedule la réactive au besoin.
-- ============================================================

alter table shelly_cl_horaire add column if not exists nb_mesures_reelles int;

comment on column shelly_cl_horaire.nb_mesures_reelles is
  'Lignes de l''heure portant une vraie mesure (valeur, ou état autre que ''offline''). 0 = heure sans aucune mesure : appareil injoignable, la collecte n''a écrit que des lignes vides.';

-- Prédicat « vraie mesure », partagé par l'agrégation et la reprise
create or replace function fn_ligne_reelle(
  p_state text, p_power_w float8, p_wh_tot float8, p_wh_rtot float8,
  p_p_a float8, p_p_b float8, p_p_c float8, p_voltage_v float8, p_current_a float8,
  p_temperature float8, p_humidity float8, p_illuminance float8, p_pressure float8,
  p_battery_level float8, p_battery_v float8, p_ppm float8, p_precipitation float8,
  p_wind float8, p_tilt float8, p_measured_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_state, '') <> 'offline'
     and (num_nonnulls(p_power_w, p_wh_tot, p_wh_rtot, p_p_a, p_p_b, p_p_c, p_voltage_v, p_current_a,
                       p_temperature, p_humidity, p_illuminance, p_pressure, p_battery_level, p_battery_v,
                       p_ppm, p_precipitation, p_wind, p_tilt, p_measured_at) > 0
          or p_state is not null)
$$;

-- ── Agrégation horaire de l'énergie : + nb_mesures_reelles ──
create or replace function fn_aggregate_horaire(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count int;
begin
  if p_since is null then
    p_since := date_trunc('hour', now() - interval '2 hours');
  end if;
  if p_until is null then
    p_until := date_trunc('hour', now()) + interval '1 hour';
  end if;

  insert into shelly_cl_horaire (
    ts_heure, site, device_id, name, device_type, device_family,
    wh_conso, wh_inj,
    power_w_moy, power_w_max,
    p_a_moy, p_b_moy, p_c_moy,
    v_a_moy, v_b_moy, v_c_moy, voltage_v_moy,
    nb_mesures, nb_mesures_reelles
  )
  select
    date_trunc('hour', ts at time zone 'UTC')          as ts_heure,
    max(site)                                          as site,
    device_id,
    max(name)                                          as name,
    max(device_type)                                   as device_type,
    max(device_family)                                 as device_family,
    -- delta du compteur Wh cumulatif sur l'heure → Wh réellement consommés
    greatest(0, max(wh_tot)  - min(wh_tot))            as wh_conso,
    -- delta du compteur retour (injection solaire)
    greatest(0, max(wh_rtot) - min(wh_rtot))           as wh_inj,
    -- moyennes de puissance (W) — NULL ignorés, pas de COALESCE(0)
    avg(power_w)                                       as power_w_moy,
    max(power_w)                                       as power_w_max,
    avg(p_a)                                           as p_a_moy,
    avg(p_b)                                           as p_b_moy,
    avg(p_c)                                           as p_c_moy,
    avg(v_a)                                           as v_a_moy,
    avg(v_b)                                           as v_b_moy,
    avg(v_c)                                           as v_c_moy,
    avg(voltage_v)                                     as voltage_v_moy,
    count(*)                                           as nb_mesures,
    count(*) filter (where fn_ligne_reelle(
      state, power_w, wh_tot, wh_rtot, p_a, p_b, p_c, voltage_v, current_a,
      temperature, humidity, illuminance_lux, pressure_hpa, battery_level, battery_voltage_v,
      concentration_ppm, precipitation_mm, wind_speed_ms, tilt_angle, measured_at))  as nb_mesures_reelles
  from shelly_cl
  where ts >= p_since and ts < p_until
  group by ts_heure, device_id
  on conflict (ts_heure, device_id)
  do update set
    name               = excluded.name,
    device_type        = excluded.device_type,
    device_family      = excluded.device_family,
    wh_conso           = excluded.wh_conso,
    wh_inj             = excluded.wh_inj,
    power_w_moy        = excluded.power_w_moy,
    power_w_max        = excluded.power_w_max,
    p_a_moy            = excluded.p_a_moy,
    p_b_moy            = excluded.p_b_moy,
    p_c_moy            = excluded.p_c_moy,
    v_a_moy            = excluded.v_a_moy,
    v_b_moy            = excluded.v_b_moy,
    v_c_moy            = excluded.v_c_moy,
    voltage_v_moy      = excluded.voltage_v_moy,
    nb_mesures         = excluded.nb_mesures,
    nb_mesures_reelles = excluded.nb_mesures_reelles;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ── Reprise de l'historique, par tranche ─────────────────────
--  Ne touche QUE nb_mesures_reelles. Une heure de shelly_cl_horaire sans
--  aucune ligne dans shelly_cl sur la tranche reçoit 0.
create or replace function fn_reprise_mesures_reelles(p_since timestamptz, p_until timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $function$
declare
  v_count int;
begin
  update shelly_cl_horaire h
     set nb_mesures_reelles = x.n
    from (
      select date_trunc('hour', c.ts at time zone 'UTC') as ts_heure, c.device_id,
             count(*) filter (where fn_ligne_reelle(
               c.state, c.power_w, c.wh_tot, c.wh_rtot, c.p_a, c.p_b, c.p_c, c.voltage_v, c.current_a,
               c.temperature, c.humidity, c.illuminance_lux, c.pressure_hpa, c.battery_level, c.battery_voltage_v,
               c.concentration_ppm, c.precipitation_mm, c.wind_speed_ms, c.tilt_angle, c.measured_at))::int as n
      from shelly_cl c
      where c.ts >= p_since and c.ts < p_until
      group by 1, 2
    ) x
   where h.ts_heure = x.ts_heure and h.device_id = x.device_id;
  get diagnostics v_count = row_count;

  update shelly_cl_horaire
     set nb_mesures_reelles = 0
   where ts_heure >= p_since and ts_heure < p_until and nb_mesures_reelles is null;

  return v_count;
end;
$function$;

revoke all on function fn_reprise_mesures_reelles(timestamptz, timestamptz) from public, anon, authenticated;

-- ── Tâche morte ──────────────────────────────────────────────
select cron.unschedule('aggregate-shelly-hourly')
where exists (select 1 from cron.job where jobname = 'aggregate-shelly-hourly');
