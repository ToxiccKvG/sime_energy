-- ============================================================
-- 2026-11-23 — Heures rattrapées depuis le cloud Shelly + début de campagne par site
--
-- 1. Heures rattrapées depuis le cloud (API v2/statistics) : insérées dans
--    shelly_cl_horaire avec nb_mesures = 0 et nb_mesures_reelles = 0, faute de
--    relevés bruts. Or « nb_mesures_reelles = 0 » veut dire « heure vide = absente » :
--    fn_profil_charge (total par jours) les écartait, fn_profil_horaire (total par
--    heures) les gardait → « Écart à vérifier » dans le rapport Courbe de charge
--    (Mairie de Rufisque, 13→20/11 : 4,667 kWh = 14 heures de GEN. S.FETES).
--    Une heure du cloud est une vraie mesure (le compteur l'a comptée) : elle porte
--    désormais nb_mesures_reelles = 1 (un relevé : celui du cloud), nb_mesures = 0.
--    Repère : nb_mesures = 0 n'est écrit QUE par les rattrapages cloud (la collecte
--    écrit toujours nb_mesures ≥ 1). Règle pour tout rattrapage futur : écrire 1.
--    Ni fn_aggregate_horaire (2 dernières heures) ni fn_reprise_mesures_reelles
--    (heures ayant des relevés bruts, ou NULL) ne remettent ces lignes à 0.
--
-- 2. shelly_accounts.debut_campagne : instant à partir duquel les mesures d'un site
--    sont exploitables (NULL = depuis le début des données). L'onglet Analyse avance
--    la période proposée (7 j, 30 j…) à cette date quand un seul site est choisi.
--    Lisible par le front (GRANT par colonne, la table en a un par colonne).
-- ============================================================

-- ── 1. Heures du cloud ───────────────────────────────────────
create table if not exists backup.horaire_cloud_mesures_20261123 as
select id, device_id, ts_heure, nb_mesures, nb_mesures_reelles
from public.shelly_cl_horaire
where nb_mesures = 0 and coalesce(nb_mesures_reelles, 0) = 0;

update public.shelly_cl_horaire
set nb_mesures_reelles = 1
where nb_mesures = 0 and coalesce(nb_mesures_reelles, 0) = 0;

-- Retour arrière :
-- update public.shelly_cl_horaire h set nb_mesures_reelles = b.nb_mesures_reelles
--   from backup.horaire_cloud_mesures_20261123 b where b.id = h.id;

-- ── 2. Début de campagne ─────────────────────────────────────
alter table public.shelly_accounts add column if not exists debut_campagne timestamptz;
comment on column public.shelly_accounts.debut_campagne is
  'Début des mesures exploitables du site (NULL = depuis le début des données). Ex. Mairie de Rufisque : 17/11/2026 17:20 UTC, consigne de l''ingénieur.';
grant select (debut_campagne) on public.shelly_accounts to authenticated;

update public.shelly_accounts
set debut_campagne = '2026-11-17 17:20:00+00'
where site = 'Mairie de Rufisque';
