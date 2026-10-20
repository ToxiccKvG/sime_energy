-- ============================================================
--  Retraits : dater à partir de la dernière VRAIE mesure — 2026-10-16
--
--  Les 48 retraits du 16/10 (Académie, Donsin, Ma Maison) ont été datés
--  « à partir de la dernière mesure »… calculée avant la correction
--  nb_mesures_reelles : les lignes vides (« offline ») écrites par la
--  collecte reculaient cette date (M1 de l'Académie : 01/09 au lieu de
--  début août). Résultat : de fausses alertes « muet » et « perte de
--  collecte » entre la vraie dernière mesure et la date déclarée.
--
--  Prérequis : 20261016_mesures_reelles.sql appliquée ET historique
--  recalculé (fn_reprise_mesures_reelles sur toute la période).
--  Ne touche qu'aux retraits déclarés le 16/10 sur décision de Maurice,
--  et seulement pour AVANCER leur date. Aucune mesure n'est modifiée.
-- ============================================================

update shelly_device_retraits rt
   set depuis = x.derniere_reelle + interval '1 hour'
  from (
    select h.device_id, max(h.ts_heure) as derniere_reelle
    from shelly_cl_horaire h
    where h.nb_mesures_reelles > 0
    group by 1
  ) x
 where rt.device_id = x.device_id
   and rt.note like '%décision de Maurice, 16/10/2026%'
   and x.derniere_reelle + interval '1 hour' < rt.depuis;
