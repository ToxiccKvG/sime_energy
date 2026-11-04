-- ============================================================
--  Énergie horaire : somme des hausses du compteur — 2026-11-04
--
--  Défaut trouvé : wh_conso valait max(wh_tot) - min(wh_tot) dans chaque
--  heure. L'énergie consommée entre le dernier relevé d'une heure et le
--  premier de la suivante n'était comptée nulle part.
--  SENELEC Mosquée le 31/10 : 8,943 kWh au lieu de 9,215 au compteur (−3 %).
--
--  Maintenant, pour chaque appareil, relevé après relevé :
--   - la hausse par rapport au plus haut déjà vu est comptée dans l'heure du
--     relevé. Un compteur qui baisse puis remonte (valeurs lues dans le
--     désordre) n'est donc pas compté deux fois ;
--   - une chute de plus de 50 % est une remise à zéro : on repart de la
--     nouvelle valeur, sans compter d'énergie ;
--   - après plus d'une heure sans mesure, la hausse n'est pas comptée : on ne
--     sait pas quand cette énergie a été consommée, et la déverser sur une
--     seule heure fausserait le profil. L'écart se mesure sur measured_at
--     (heure de la mesure), sinon sur ts (heure de la collecte).
--
--  shelly_cl n'est jamais modifiée. Reprise de l'historique :
--  scripts/reprise_energie_horaire.sh, après sauvegarde dans le schéma backup.
-- ============================================================

create or replace function fn_energie_compteur(p_since timestamptz, p_until timestamptz)
returns table(ts_heure timestamptz, device_id text, wh_conso float8, wh_inj float8)
language sql
stable
set search_path = public
set statement_timeout = '0'
as $$
  with
  -- Une heure avant p_since : pour relier le premier relevé de la tranche
  conso as (
    select c.device_id, c.ts, c.wh_tot as v, coalesce(c.measured_at, c.ts) as t_m,
           lag(c.wh_tot) over w as prev,
           lag(coalesce(c.measured_at, c.ts)) over w as prev_m
    from shelly_cl c
    where c.ts >= p_since - interval '1 hour' and c.ts < p_until and c.wh_tot is not null
    window w as (partition by c.device_id order by c.ts)
  ),
  inj as (
    select c.device_id, c.ts, c.wh_rtot as v, coalesce(c.measured_at, c.ts) as t_m,
           lag(c.wh_rtot) over w as prev,
           lag(coalesce(c.measured_at, c.ts)) over w as prev_m
    from shelly_cl c
    where c.ts >= p_since - interval '1 hour' and c.ts < p_until and c.wh_rtot is not null
    window w as (partition by c.device_id order by c.ts)
  ),
  releves as (
    select 'conso' as flux, * from conso
    union all
    select 'inj', * from inj
  ),
  -- Chaque remise à zéro ouvre un nouveau groupe de relevés
  groupes as (
    select *, sum(case when prev is not null and v < prev * 0.5 then 1 else 0 end)
                over (partition by flux, device_id order by ts) as grp
    from releves
  ),
  plus_haut as (
    select *, max(v) over (partition by flux, device_id, grp order by ts
                           rows between unbounded preceding and 1 preceding) as max_avant
    from groupes
  ),
  hausses as (
    select flux, device_id, date_trunc('hour', ts at time zone 'UTC') as heure,
           case when max_avant is not null and t_m - prev_m <= interval '1 hour'
                then greatest(0, v - max_avant) else 0 end as hausse
    from plus_haut
    where ts >= p_since
  )
  select heure at time zone 'UTC', h.device_id,
         coalesce(sum(hausse) filter (where flux = 'conso'), 0),
         coalesce(sum(hausse) filter (where flux = 'inj'), 0)
  from hausses h
  group by heure, h.device_id
$$;

revoke all on function fn_energie_compteur(timestamptz, timestamptz) from public, anon, authenticated;

-- ── Agrégation horaire : l'énergie vient de fn_energie_compteur ──
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
    a.ts_heure, a.site, a.device_id, a.name, a.device_type, a.device_family,
    coalesce(e.wh_conso, 0), coalesce(e.wh_inj, 0),
    a.power_w_moy, a.power_w_max,
    a.p_a_moy, a.p_b_moy, a.p_c_moy,
    a.v_a_moy, a.v_b_moy, a.v_c_moy, a.voltage_v_moy,
    a.nb_mesures, a.nb_mesures_reelles
  from (
    select
      date_trunc('hour', c.ts at time zone 'UTC') at time zone 'UTC' as ts_heure,
      max(c.site)          as site,
      c.device_id,
      max(c.name)          as name,
      max(c.device_type)   as device_type,
      max(c.device_family) as device_family,
      -- moyennes de puissance (W) — NULL ignorés, pas de COALESCE(0)
      avg(c.power_w)       as power_w_moy,
      max(c.power_w)       as power_w_max,
      avg(c.p_a)           as p_a_moy,
      avg(c.p_b)           as p_b_moy,
      avg(c.p_c)           as p_c_moy,
      avg(c.v_a)           as v_a_moy,
      avg(c.v_b)           as v_b_moy,
      avg(c.v_c)           as v_c_moy,
      avg(c.voltage_v)     as voltage_v_moy,
      count(*)             as nb_mesures,
      count(*) filter (where fn_ligne_reelle(
        c.state, c.power_w, c.wh_tot, c.wh_rtot, c.p_a, c.p_b, c.p_c, c.voltage_v, c.current_a,
        c.temperature, c.humidity, c.illuminance_lux, c.pressure_hpa, c.battery_level, c.battery_voltage_v,
        c.concentration_ppm, c.precipitation_mm, c.wind_speed_ms, c.tilt_angle, c.measured_at)) as nb_mesures_reelles
    from shelly_cl c
    where c.ts >= p_since and c.ts < p_until
    group by 1, c.device_id
  ) a
  left join fn_energie_compteur(p_since, p_until) e
    on e.ts_heure = a.ts_heure and e.device_id = a.device_id
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
--  Ne touche QUE wh_conso et wh_inj, et seulement là où la valeur change.
create or replace function fn_reprise_energie_horaire(p_since timestamptz, p_until timestamptz)
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
     set wh_conso = e.wh_conso, wh_inj = e.wh_inj
    from fn_energie_compteur(p_since, p_until) e
   where h.ts_heure = e.ts_heure and h.device_id = e.device_id
     and (h.wh_conso is distinct from e.wh_conso or h.wh_inj is distinct from e.wh_inj);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function fn_reprise_energie_horaire(timestamptz, timestamptz) from public, anon, authenticated;

-- ── Retour arrière de la reprise, si besoin ──────────────────
--  update shelly_cl_horaire h set wh_conso = b.wh_conso, wh_inj = b.wh_inj
--    from backup.shelly_cl_horaire_energie_20261104 b where b.id = h.id;
