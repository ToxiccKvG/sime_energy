-- ============================================================
--  fn_energy_by_day — énergie journalière agrégée côté serveur
--
--  Bug corrigé : le calendrier d'activité du dashboard ramenait
--  `shelly_cl_horaire` ligne à ligne pour agréger par jour côté
--  navigateur, avec un `.limit(50000)` et SANS `order()`. Or 90 jours
--  représentent 72 appareils × 24 h × 90 = 155 520 lignes. Le plafond
--  coupait aux deux tiers et PostgREST, sans tri, renvoyait un
--  sous-ensemble arbitraire : le calendrier affichait une poignée de
--  jours verts au hasard alors que la base a des données tous les
--  jours (91 jours sur 90 vérifiés).
--
--  Augmenter la limite n'était pas la réponse : on agrège ici pour ne
--  renvoyer que ~90 lignes au lieu de 155 000.
--
--  Signature et conventions alignées sur fn_energy_by_device
--  (migration 20260612) : mêmes filtres optionnels, SECURITY DEFINER,
--  statement_timeout explicite.
-- ============================================================

create or replace function fn_energy_by_day(
  p_since      timestamptz,
  p_until      timestamptz,
  p_sites      text[] default null,
  p_families   text[] default null,
  p_device_ids text[] default null
)
returns table(jour date, kwh float8)
language sql
stable
security definer
set statement_timeout = '55s'
as $$
  select
    h.ts_heure::date                          as jour,
    coalesce(sum(h.wh_conso), 0) / 1000.0     as kwh
  from shelly_cl_horaire h
  where h.ts_heure >= (p_since at time zone 'UTC')
    and h.ts_heure <= (p_until at time zone 'UTC')
    and (p_sites      is null or h.site          = any(p_sites))
    and (p_families   is null or h.device_family = any(p_families))
    and (p_device_ids is null or h.device_id     = any(p_device_ids))
  group by 1
  order by 1
$$;

comment on function fn_energy_by_day is
  'Énergie consommée par jour (somme des wh_conso horaires), filtrable par site / famille / appareil. Remplace une agrégation côté navigateur qui dépassait le plafond de lignes de PostgREST.';

revoke all on function fn_energy_by_day(timestamptz, timestamptz, text[], text[], text[]) from public;
grant execute on function fn_energy_by_day(timestamptz, timestamptz, text[], text[], text[]) to authenticated;
