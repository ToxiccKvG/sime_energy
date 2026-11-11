-- ============================================================
--  Réponses câblage du 2026-09-17 (utilisateur) → notes des rôles
--
--  Ne change aucun rôle ni aucun confirme_at : consigne ce qu'on sait
--  du câblage sur les lignes concernées, pour que l'écran des rôles
--  et les futurs bilans aient l'information sous la main.
--
--  Réponses :
--   1. Building communal : le surplus PV de midi est INJECTÉ au réseau
--      SENELEC. (M1 ne compte pourtant aucune injection → à vérifier :
--      config du Pro 3EM 400 A ou capture de wh_rtot.)
--   2. M4 (groupe) : capteurs DÉSACTIVÉS — pas une panne.
--   3. TGBT_EPT Thiès : compteur SENELEC SÉPARÉ, sans PV → bâtiment
--      indépendant, hors chaîne M1–M5 du building communal.
--   4. Bureau CER2E-Thiès : compteur Woyofal (prépayé) PROPRE → ses départs
--      sont hors bilan M1–M5.
--   5. Donsin : PV EN AVAL de l'« Arrivée générale » → le compteur ne voit
--      que le complément réseau ; la charge réelle et le PV ne sont pas
--      mesurés (schéma B sans M5).
--   6. Cafétéria_TD / Charges_TD : DÉSACTIVÉS / débranchés.
-- ============================================================

-- 2. Groupe
update shelly_device_roles set notes =
  'Câblage 2026-09-17 : capteurs désactivés (pas une panne). Groupe non mesuré tant qu''ils ne sont pas rebranchés.'
where device_id in ('08f9e0e4d080', '08f9e0e4d080_1');

-- 3. TGBT EPT
update shelly_device_roles set
  libelle = 'TGBT bâtiment EPT — compteur SENELEC séparé, hors chaîne M1–M5',
  notes   = 'Câblage 2026-09-17 : arrivée SENELEC propre, sans PV. Bâtiment indépendant du building communal ; les données le confirment (dépasse M3 sur 313 h, jours ouvrés 9h–15h). Rôle AUTRE faute d''un « second site » dans le modèle : deviendra M1_RESEAU/M3_CHARGE de son propre site quand Paramètres saura distinguer les lieux d''un compte.'
where device_id = '08f9e0e82db0';

-- 4. Bureau CER2E-Thiès : départs sur le compteur Woyofal
update shelly_device_roles set notes =
  coalesce(notes, '') || ' Câblage 2026-09-17 : bureau CER2E-Thiès sur compteur Woyofal (prépayé) propre → hors bilan M1–M5 du building communal.'
where device_id in (
  '206ef102b9c4', '206ef102b9c4_1', '206ef102b9c4_2', '206ef102b9c4_3',   -- Box Wifi, Télé, Woyofal, Caméra
  '34987a68c520', '34987a68c520_1', '34987a68c520_2', '34987a68c520_3',   -- Prises 1–4
  '34b7da8a47a0', '34b7da8a4aa0',                                          -- Éclairage disjoncteurs 1–2
  '54320452d75c', '8cbfea9705f4', '543204ba4b18',                          -- Frigo cuisine, PC informatique, Ventilo
  'ec6260821468', '0892724e2e88'                                           -- ECL Salle Formation, Wifi & Télé 2
);

-- 5. Donsin
update shelly_device_roles set notes =
  'Câblage 2026-09-17 : la centrale PV est EN AVAL de ce compteur → il ne mesure que le complément réseau (SONABEL), pas la charge totale. Schéma B sans compteur PV : M3 et M5 inconnus tant qu''aucun compteur n''est posé côté PV/charge.'
where device_id = '441d6475d44c';

-- 6. Tableaux divisionnaires
update shelly_device_roles set notes =
  'Câblage 2026-09-17 : capteurs désactivés / débranchés (aucune valeur depuis le 20/04/2026). Rôle DEPART déduit du nom (TD = tableau divisionnaire), à revérifier s''ils sont rebranchés.'
where device_id in ('08f9e0ea7d94', '08f9e051dfa2');

-- 1. Building communal : consigner l'injection sur M1
update shelly_device_roles set notes =
  coalesce(notes, '') || ' Câblage 2026-09-17 : le surplus PV de midi est injecté au réseau SENELEC — ce compteur devrait voir de l''injection (wh_rtot), il n''en remonte aucune : config Pro 3EM ou capture à vérifier.'
where device_id = '08f9e0e8d774';
