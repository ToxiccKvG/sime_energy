-- ============================================================
--  Académie CER2E : appareils déconnectés volontairement — 2026-10-16
--
--  Décision de Maurice (16/10) : tous les appareils de l'Académie muets
--  à cette date sont déconnectés VOLONTAIREMENT. Chacun est déclaré à
--  partir de sa dernière mesure. Leurs données restent en base, entières
--  et utilisables ; la déclaration arrête seulement les alertes
--  (APPAREIL_MUET, PERTE_COLLECTE). Si un appareil revient, renseigner
--  jusqu_a : il sera de nouveau surveillé.
--
--  Sélection d'après les données, pas une liste recopiée :
--    - l'appareil a un rôle (il est « attendu ») ;
--    - sa DERNIÈRE mesure, tous sites confondus, est à l'Académie
--      (« Compteur 2 », parti à Donsin le 10/08, n'est donc pas pris) ;
--    - il est muet depuis plus de 2 jours au 16/10/2026.
--  Prérequis : 20261016_appareil_muet.sql (table shelly_device_retraits).
--  Rejouable : un appareil déjà déclaré n'est pas déclaré deux fois.
-- ============================================================

with derniere as (
  select h.device_id,
         max(h.ts_heure) as derniere,
         (array_agg(h.site order by h.ts_heure desc))[1] as site
  from shelly_cl_horaire h
  where h.device_id in (select device_id from shelly_device_roles)
  group by 1
)
insert into shelly_device_retraits (device_id, depuis, motif, note)
select d.device_id, d.derniere + interval '1 hour', 'deconnecte_volontairement',
       'Académie CER2E : déconnecté volontairement (décision de Maurice, 16/10/2026)'
from derniere d
where d.site = 'Académie CER2E'
  and d.derniere < timestamptz '2026-10-16 00:00:00+00' - interval '2 days'
  and not exists (select 1 from shelly_device_retraits rt where rt.device_id = d.device_id and rt.jusqu_a is null);
