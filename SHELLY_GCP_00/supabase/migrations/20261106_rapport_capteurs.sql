-- ============================================================
--  Rapport tous capteurs : grandeurs par heure, états — 2026-11-06
--
--  Le rapport ne lisait que l'énergie. Ces deux lectures lui donnent le reste :
--   1. fn_capteurs_horaire : température, humidité, météo, luminosité,
--      inclinaison, gaz, pile, signal, par heure et par appareil, pour les
--      familles sans énergie (shelly_familles) et les appareils non classés ;
--   2. fn_etats_appareil : ce qu'un capteur d'état a fait (porte, mouvement,
--      bouton, relais). Le dernier état de l'heure ne suffit pas à compter des
--      ouvertures : on lit les relevés bruts, un appareil à la fois, sur l'index
--      (device_id, ts).
--
--  Aucune n'écrit. Security invoker : la RLS de l'organisation s'applique.
-- ============================================================

create or replace function fn_capteurs_horaire(
  p_date_debut  date,
  p_date_fin    date,
  p_heure_debut int     default 0,
  p_heure_fin   int     default 23,
  p_sites       text[]  default null,
  p_device_ids  text[]  default null
)
returns table(
  ts_heure timestamptz, site text, device_id text, name text, device_family text, device_type text,
  temperature float8, temperature_min float8, temperature_max float8,
  humidite float8, ressenti float8, point_rosee float8,
  uv float8, uv_max float8, lux float8, lux_max float8, pression float8,
  pluie_mm float8, vent float8, rafale float8,
  inclinaison float8, gaz_ppm float8, temp_interne float8,
  batterie float8, signal float8, nb_mesures_reelles int
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
as $$
  select h.ts_heure, h.site, h.device_id, h.name, h.device_family, h.device_type,
         h.temperature_moy, h.temperature_min, h.temperature_max,
         h.humidity_moy, h.feels_like_c_moy, h.dewpoint_c_moy,
         h.uv_index_moy, h.uv_index_max, h.illuminance_lux_moy, h.illuminance_lux_max, h.pressure_hpa_moy,
         h.pluie_mm, h.wind_speed_ms_moy, h.wind_gust_ms_max,
         h.tilt_angle_moy, h.concentration_ppm_moy, h.device_temp_c_moy,
         h.battery_level_min, h.signal_rssi_moy, h.nb_mesures_reelles
  from shelly_cl_horaire h
  left join shelly_familles f on f.code = h.device_family
  where h.ts_heure >= p_date_debut::timestamp at time zone 'UTC'
    and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
    and (p_sites      is null or h.site      = any(p_sites))
    and (p_device_ids is null or h.device_id = any(p_device_ids))
    -- Famille inconnue de shelly_familles (INCONNU) : gardée, listée comme non classée
    and coalesce(f.mesure_energie, false) = false
    and case when p_heure_debut <= p_heure_fin
             then extract(hour from h.ts_heure at time zone 'UTC') between p_heure_debut and p_heure_fin
             else extract(hour from h.ts_heure at time zone 'UTC') >= p_heure_debut
               or extract(hour from h.ts_heure at time zone 'UTC') <= p_heure_fin
        end
  order by h.ts_heure, h.device_id
$$;

revoke all on function fn_capteurs_horaire(date, date, int, int, text[], text[]) from public;
grant execute on function fn_capteurs_horaire(date, date, int, int, text[], text[]) to authenticated;

-- ── États d'un appareil ──────────────────────────────────────
--  Une ligne par état : combien de fois l'appareil y est entré, et combien de
--  temps il y est resté. Un écart de plus de 15 minutes entre deux relevés n'est
--  pas compté dans les durées : on ne sait pas ce qui s'est passé pendant ce
--  trou. Les premiers relevés de la période ne comptent pas comme une entrée.
--  par_heure : entrées dans l'état selon l'heure (24 valeurs).
--  par_jour  : entrées dans l'état selon le jour.
create or replace function fn_etats_appareil(
  p_device_id text, p_debut timestamptz, p_fin timestamptz,
  p_heure_debut int default 0, p_heure_fin int default 23
)
returns table(
  device_id text, etat text, nb_entrees int, duree_s float8, nb_releves int,
  par_heure int[], par_jour jsonb, duree_inconnue_s float8
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '30s'
as $$
  with
  brut as materialized (
    select c.ts, c.state
    from shelly_cl c
    where c.device_id = p_device_id and c.ts >= p_debut and c.ts < p_fin
      and c.state is not null and c.state not in ('offline', 'unknown')
  ),
  suite as (
    select b.ts, b.state,
           lag(b.state) over w as avant,
           lead(b.ts) over w as apres
    from brut b
    window w as (order by b.ts)
  ),
  marque as (
    select s.*,
           extract(epoch from (s.apres - s.ts)) as ecart,
           (s.avant is not null and s.avant <> s.state) as entree,
           extract(hour from s.ts at time zone 'UTC')::int as h,
           (s.ts at time zone 'UTC')::date as j
    from suite s
    where case when p_heure_debut <= p_heure_fin
               then extract(hour from s.ts at time zone 'UTC') between p_heure_debut and p_heure_fin
               else extract(hour from s.ts at time zone 'UTC') >= p_heure_debut
                 or extract(hour from s.ts at time zone 'UTC') <= p_heure_fin
          end
  ),
  heures as (
    select m.state, m.h, count(*) filter (where m.entree)::int as n
    from marque m group by 1, 2
  ),
  jours as (
    select m.state, m.j, count(*) filter (where m.entree)::int as n
    from marque m group by 1, 2
  )
  select p_device_id, m.state,
         (count(*) filter (where m.entree))::int,
         coalesce(sum(m.ecart) filter (where m.ecart <= 900), 0),
         count(*)::int,
         (select array_agg(coalesce((select hh.n from heures hh where hh.state = m.state and hh.h = g), 0) order by g)
            from generate_series(0, 23) g),
         (select coalesce(jsonb_object_agg(jj.j::text, jj.n), '{}'::jsonb) from jours jj where jj.state = m.state and jj.n > 0),
         coalesce(sum(m.ecart) filter (where m.ecart > 900), 0)
  from marque m
  group by m.state
$$;

revoke all on function fn_etats_appareil(text, timestamptz, timestamptz, int, int) from public;
grant execute on function fn_etats_appareil(text, timestamptz, timestamptz, int, int) to authenticated;
