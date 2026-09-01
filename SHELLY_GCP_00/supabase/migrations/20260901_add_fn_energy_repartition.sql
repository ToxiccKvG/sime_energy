-- ============================================================
--  fn_energy_repartition — contribution de chaque appareil d'un groupe
--
--  Complément de fn_energy_profile : celle-ci découpe un total dans le
--  TEMPS, celle-là le découpe entre APPAREILS. Les deux lisent la même
--  table avec les mêmes règles (dont la permutation des TC inversés),
--  ce qui garantit que la somme des barres égale la courbe.
--
--  Corrige un défaut de la première version de la popup : la
--  répartition était alimentée par la puissance instantanée du
--  snapshot. En vue live, elle affichait donc six appareils à
--  « 0,00 W » sous un total de 52,78 kWh — deux grandeurs, deux
--  instants, aucun rapport entre eux.
--
--  fn_energy_by_device ne pouvait pas servir : elle calcule un delta de
--  wh_tot et ignore sens_inverse, donc elle compte zéro pour le
--  compteur PV dont le TC est monté à l'envers — précisément celui qui
--  porte l'essentiel du total à l'Académie CER2E.
-- ============================================================

create or replace function fn_energy_repartition(
  p_since      timestamptz,
  p_until      timestamptz,
  p_device_ids text[],
  p_inverses   text[] default null
)
returns table(
  device_id  text,
  name       text,
  site       text,
  kwh        float8,
  kwh_inj    float8,
  p_moy_w    float8,   -- puissance moyenne de l'appareil sur la période
  nb_heures  int       -- heures réellement remontées : distingue « rien consommé » de « rien mesuré »
)
language sql
stable
security definer
set statement_timeout = '55s'
as $$
  select
    h.device_id,
    max(h.name)                                            as name,
    max(h.site)                                            as site,
    (sum(case when p_inverses is not null and h.device_id = any(p_inverses)
              then h.wh_inj else h.wh_conso end) / 1000.0)::float8,
    (sum(case when p_inverses is not null and h.device_id = any(p_inverses)
              then h.wh_conso else h.wh_inj end) / 1000.0)::float8,
    avg(h.power_w_moy)::float8,
    count(*)::int
  from shelly_cl_horaire h
  where h.ts_heure >= (p_since at time zone 'UTC')
    and h.ts_heure <= (p_until at time zone 'UTC')
    and h.device_id = any(p_device_ids)
  group by h.device_id
  order by 4 desc
$$;

comment on function fn_energy_repartition is
  'Énergie et puissance moyenne par appareil sur une période, pour un groupe donné. Mêmes règles que fn_energy_profile (dont p_inverses) : la somme des lignes égale le total de la courbe.';

revoke all on function fn_energy_repartition(timestamptz, timestamptz, text[], text[]) from public;
grant execute on function fn_energy_repartition(timestamptz, timestamptz, text[], text[]) to authenticated;
