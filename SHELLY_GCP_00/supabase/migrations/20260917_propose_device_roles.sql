-- ============================================================
--  Propositions de rôles pour les appareils non classés (2026-09-17)
--
--  Analyse du 2026-09-16 sur les 83 appareils du catalogue (75 sans rôle).
--  Tout est inséré en origine='auto', confirme_at NULL : ce sont des
--  PROPOSITIONS que l'écran des rôles présente « à confirmer », jamais
--  des rattachements acquis. Les 8 rôles déjà présents ne sont pas touchés
--  (on conflict do nothing).
--
--  1. Déduction par famille (71 appareils) — le matériel dit ce qu'il mesure :
--       CAPTEUR_ENV          → AMBIANCE
--       ENERGIE_1PH, LUMIERE → DEPART
--       ETAT                 → AUTRE   (portes, mouvement, fumée, relais sans mesure)
--       INCONNU              → DEPART si le type mesure une puissance
--                              (Plus 2PM SPSW-202, Plug S S3PL), AUTRE sinon
--                              (détecteur de présence, passerelle BT)
--       ENERGIE_2PH canal 2 « ECL hall-séjour-cuisine » (Ma Maison) → DEPART :
--                              0,9 kWh/30 j, jamais au-dessus de EM-SENELEC sur 720 h.
--
--  2. Compteurs triphasés de l'Académie CER2E (3 vraies décisions) :
--       Cafétéria_TD RDC, Charges_TD niveau 2 → DEPART, par le NOM seulement
--         (TD = tableau divisionnaire) : ces deux Pro 3EM n'ont jamais remonté
--         une seule valeur depuis le 20/04 (18 776 lignes vides chacun), la
--         collecte ne peut rien confirmer.
--       TGBT_EPT Thiès → AUTRE, et NON DEPART : la collecte (mai→juil, 2 058 h)
--         montre qu'il dépasse M3_CHARGE sur 313 h, systématiquement les jours
--         ouvrés 9 h–15 h (ex. 4 mai 13 h : 23,1 kWh contre 12,0 pour M3) ;
--         profil ~150–250 kWh les jours ouvrés, ~20 kWh les week-ends. Un
--         sous-compteur ne consomme pas plus que son amont : c'est l'arrivée
--         d'un AUTRE bâtiment (EPT), hors chaîne M1–M5. Le vocabulaire actuel
--         n'a pas de « second site » — à revoir avec le chantier Paramètres.
-- ============================================================

insert into shelly_device_roles (device_id, role, libelle, origine, notes)
select
  c.device_id,
  case
    -- cas particuliers d'abord
    when c.device_id = '08f9e0e82db0' then 'AUTRE'      -- TGBT_EPT Thiès
    when c.device_id in ('08f9e0ea7d94', '08f9e051dfa2') then 'DEPART'  -- Cafétéria_TD, Charges_TD
    when c.device_id = 'c45bbee265f5_1' then 'DEPART'   -- ECL hall-séjour-cuisine (canal 2 SHEM)
    when c.device_id in ('ec6260821468', '0892724e2e88') then 'DEPART' -- INCONNU qui mesurent
    when c.device_id in ('ccba97ee6e80', 'b0b21cfaf1a0') then 'AUTRE'  -- présence, passerelle BT
    -- puis la famille
    when c.device_family = 'CAPTEUR_ENV' then 'AMBIANCE'
    when c.device_family in ('ENERGIE_1PH', 'LUMIERE') then 'DEPART'
    when c.device_family = 'ETAT' then 'AUTRE'
  end as role,
  c.name,
  'auto',
  case
    when c.device_id = '08f9e0e82db0' then
      'Proposition auto 2026-09-17 — Arrivée d''un bâtiment indépendant (EPT) : dépasse M3_CHARGE sur 313 h (jours ouvrés 9h–15h, mai→juil 2026), donc pas un départ sous M3. Hors chaîne M1–M5.'
    when c.device_id in ('08f9e0ea7d94', '08f9e051dfa2') then
      'Proposition auto 2026-09-17 — déduit du nom (TD = tableau divisionnaire) uniquement : aucune valeur remontée depuis le 20/04/2026, à vérifier avec le câblage.'
    when c.device_id = 'c45bbee265f5_1' then
      'Proposition auto 2026-09-17 — circuit d''éclairage sous EM-SENELEC : 0,9 kWh/30 j, jamais supérieur à l''arrivée sur 720 h.'
    when c.device_id in ('ec6260821468', '0892724e2e88') then
      'Proposition auto 2026-09-17 — famille INCONNU mais le type mesure une puissance (' || c.device_type || ').'
    when c.device_id in ('ccba97ee6e80', 'b0b21cfaf1a0') then
      'Proposition auto 2026-09-17 — famille INCONNU, aucune mesure électrique (' || c.device_type || ').'
    else
      'Proposition auto 2026-09-17 — déduit de la famille ' || c.device_family || '.'
  end
from shelly_devices_catalog c
left join shelly_device_roles r using (device_id)
where r.device_id is null
  and (
    c.device_id in ('08f9e0e82db0', '08f9e0ea7d94', '08f9e051dfa2', 'c45bbee265f5_1',
                    'ec6260821468', '0892724e2e88', 'ccba97ee6e80', 'b0b21cfaf1a0')
    or c.device_family in ('CAPTEUR_ENV', 'ENERGIE_1PH', 'LUMIERE', 'ETAT')
  )
on conflict (device_id) do nothing;
