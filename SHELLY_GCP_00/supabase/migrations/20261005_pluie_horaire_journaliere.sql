-- ============================================================
--  Pluie réelle (par heure / par jour) à partir du compteur cumulatif.
--
--  Constat 2026-10-02 : la station météo Donsin (SBWS-90CM) renvoie dans
--  `precipitation:0` un COMPTEUR CUMULATIF depuis son installation (334,2 mm
--  fin août → 392,9 mm fin septembre). Le poller le stocke tel quel
--  (shelly_cl.precipitation_mm), ce qui est correct. Mais :
--    · shelly_cl_horaire.precipitation_mm  = max(compteur) de l'heure
--    · shelly_cl_journalier.pluie_max_mm   = max(compteur) du jour
--  → ce sont des CUMULS, pas la pluie de la période. Le front les affiche
--  comme « Précipitations (mm) ».
--
--  Ces colonnes sont conservées (le front en dépend ; le cumul brut reste la
--  bonne donnée source, jamais filtrée). On ajoute deux vues qui en dérivent
--  la pluie réelle, et on documente les colonnes existantes.
--
--  Règles :
--    · pluie_mm(heure) = cumul de l'heure − cumul de la précédente heure
--      OBSERVÉE du même appareil. La station est muette la nuit : la pluie
--      tombée pendant le silence apparaît donc à l'heure de reprise
--      (champ `apres_silence_h` = heures écoulées depuis la dernière mesure).
--    · compteur qui diminue (remise à zéro) → la pluie de l'heure est le
--      nouveau cumul (pluie depuis la remise à zéro).
--    · première heure connue d'un appareil : pas de référence → NULL.
-- ============================================================

create or replace view shelly_pluie_horaire as
with h as (
  select
    ts_heure, device_id, site, name,
    precipitation_mm as cumul_mm,
    lag(precipitation_mm) over w as cumul_prec_mm,
    lag(ts_heure)         over w as heure_prec
  from shelly_cl_horaire
  where precipitation_mm is not null
  window w as (partition by device_id order by ts_heure)
)
select
  ts_heure, device_id, site, name,
  cumul_mm,
  case
    when cumul_prec_mm is null then null
    when cumul_mm >= cumul_prec_mm then round((cumul_mm - cumul_prec_mm)::numeric, 2)
    else round(cumul_mm::numeric, 2)                       -- remise à zéro du compteur
  end as pluie_mm,
  (cumul_prec_mm is not null and cumul_mm < cumul_prec_mm) as remise_a_zero,
  round((extract(epoch from (ts_heure - heure_prec)) / 3600)::numeric, 0) - 1 as apres_silence_h
from h;

create or replace view shelly_pluie_journaliere as
select
  (ts_heure at time zone 'UTC')::date as jour,
  device_id,
  max(site) as site,
  max(name) as name,
  round(sum(pluie_mm)::numeric, 1)    as pluie_mm,
  max(cumul_mm)                        as cumul_fin_jour_mm,
  count(*) filter (where pluie_mm > 0) as nb_heures_pluie,
  bool_or(remise_a_zero)               as remise_a_zero
from shelly_pluie_horaire
group by 1, 2;

alter view shelly_pluie_horaire    set (security_invoker = true);
alter view shelly_pluie_journaliere set (security_invoker = true);
revoke all on shelly_pluie_horaire, shelly_pluie_journaliere from anon;
grant select on shelly_pluie_horaire, shelly_pluie_journaliere to authenticated, service_role;

comment on view shelly_pluie_horaire is 'Pluie réelle par heure = différence du compteur cumulatif (shelly_cl_horaire.precipitation_mm). Voir en-tête de migration 20261005_pluie_horaire_journaliere.';
comment on view shelly_pluie_journaliere is 'Pluie réelle par jour (UTC) = somme de shelly_pluie_horaire. La pluie tombée pendant un silence de la station est comptée à la reprise.';
comment on column shelly_cl_horaire.precipitation_mm is 'CUMUL du compteur de pluie depuis l''installation de la station (mm), pas la pluie de l''heure — voir shelly_pluie_horaire.pluie_mm.';
comment on column shelly_cl_journalier.pluie_max_mm is 'CUMUL max du compteur de pluie depuis l''installation (mm), pas la pluie du jour — voir shelly_pluie_journaliere.pluie_mm.';
