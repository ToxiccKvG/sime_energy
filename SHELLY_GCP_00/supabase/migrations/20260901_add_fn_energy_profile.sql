-- ============================================================
--  fn_energy_profile — profil temporel d'un ensemble de compteurs
--
--  Alimente la popup de détail du dashboard (tuiles KPI, nœuds du
--  schéma de flux, qualité 3 phases) : la carte ne montre qu'un
--  total, la popup montre COMMENT ce total s'est constitué —
--  courbe horaire ou journalière, pointe de puissance, tensions,
--  répartition par phase.
--
--  Pourquoi une fonction et non une lecture directe de
--  shelly_cl_horaire : 30 jours × 24 h × 19 appareils = 13 680
--  lignes, très au-dessus du plafond de PostgREST. Même leçon que
--  fn_energy_by_day (migration du même jour) : on agrège côté
--  serveur pour ne renvoyer que ~30 à ~720 lignes.
--
--  Deux niveaux d'agrégation, et c'est essentiel :
--   1. par HEURE, on SOMME entre appareils (une puissance de groupe
--      est bien la somme des puissances) ;
--   2. par jour, on MOYENNE entre heures (sommer 24 moyennes
--      horaires donnerait une puissance 24 fois trop grande).
--  L'énergie, elle, se somme aux deux niveaux.
--
--  p_inverses : appareils dont le TC est monté à l'envers (cas relevé
--  sur PV_BUILDING COMMUNAL). Leur consommation est enregistrée dans
--  wh_inj ; on permute pour eux seuls, ce qu'un simple sum() sur le
--  groupe ne saurait pas faire.
-- ============================================================

create or replace function fn_energy_profile(
  p_since      timestamptz,
  p_until      timestamptz,
  p_device_ids text[],
  p_bucket     text default 'hour',
  p_inverses   text[] default null
)
returns table(
  bucket      timestamp,
  kwh         float8,   -- énergie consommée sur le pas de temps
  kwh_inj     float8,   -- énergie injectée / retour compteur
  p_moy_w     float8,   -- puissance moyenne du groupe
  p_max_w     float8,   -- pointe (somme des maxima appareil sur l'heure la plus chargée)
  v_a         float8,
  v_b         float8,
  v_c         float8,
  v_mono      float8,   -- tension des compteurs monophasés
  p_a         float8,
  p_b         float8,
  p_c         float8,
  nb_devices  int,      -- appareils ayant réellement remonté sur le pas de temps
  nb_mesures  int
)
language sql
stable
security definer
set statement_timeout = '55s'
as $$
  with par_heure as (
    select
      h.ts_heure,
      sum(case when p_inverses is not null and h.device_id = any(p_inverses)
               then h.wh_inj else h.wh_conso end)              as wh_conso,
      sum(case when p_inverses is not null and h.device_id = any(p_inverses)
               then h.wh_conso else h.wh_inj end)              as wh_inj,
      sum(h.power_w_moy)                                       as p_moy_w,
      sum(h.power_w_max)                                       as p_max_w,
      avg(h.v_a_moy)                                           as v_a,
      avg(h.v_b_moy)                                           as v_b,
      avg(h.v_c_moy)                                           as v_c,
      avg(h.voltage_v_moy)                                     as v_mono,
      sum(h.p_a_moy)                                           as p_a,
      sum(h.p_b_moy)                                           as p_b,
      sum(h.p_c_moy)                                           as p_c,
      count(distinct h.device_id)                              as nb_devices,
      sum(h.nb_mesures)                                        as nb_mesures
    from shelly_cl_horaire h
    where h.ts_heure >= (p_since at time zone 'UTC')
      and h.ts_heure <= (p_until at time zone 'UTC')
      and h.device_id = any(p_device_ids)
    group by 1
  )
  -- Références toutes qualifiées par `ph` : les colonnes de sortie déclarées
  -- dans `returns table` (kwh, v_a, p_a…) sont visibles comme paramètres dans
  -- une fonction SQL, et un nom nu lèverait « column reference is ambiguous ».
  select
    date_trunc(case when p_bucket = 'day' then 'day' else 'hour' end, ph.ts_heure)::timestamp,
    (sum(ph.wh_conso) / 1000.0)::float8,
    (sum(ph.wh_inj)   / 1000.0)::float8,
    avg(ph.p_moy_w)::float8,
    max(ph.p_max_w)::float8,
    avg(ph.v_a)::float8, avg(ph.v_b)::float8, avg(ph.v_c)::float8, avg(ph.v_mono)::float8,
    avg(ph.p_a)::float8, avg(ph.p_b)::float8, avg(ph.p_c)::float8,
    max(ph.nb_devices)::int,
    sum(ph.nb_mesures)::int
  from par_heure ph
  group by 1
  order by 1
$$;

comment on function fn_energy_profile is
  'Profil horaire ou journalier (énergie, puissance, tensions, phases) d''un ensemble d''appareils. Somme entre appareils, moyenne entre heures pour les grandeurs de puissance. p_inverses permute conso/injection pour les TC montés à l''envers.';

revoke all on function fn_energy_profile(timestamptz, timestamptz, text[], text, text[]) from public;
grant execute on function fn_energy_profile(timestamptz, timestamptz, text[], text, text[]) to authenticated;
