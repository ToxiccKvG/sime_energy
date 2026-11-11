-- ============================================================
--  Nouveaux sites « Boussoura » et « Babs Ndiaye » — 2026-10-29
--
--  Deux comptes Shelly Cloud dédiés, collectés en entier
--  (appareils_inclus = null) :
--    Boussoura    sewab.sn             shelly-242-eu  12 voies
--    Babs Ndiaye  babacarndiaye2       shelly-188-eu   6 voies
--
--  La ligne « Prestation CER2E » (Shelly EM 08f9e0e4d080, pièce SENELEC
--  de Mme Boussara) est GARDÉE telle quelle : décision de Maurice le
--  29/10, les deux compteurs restent collectés.
--
--  Les lignes shelly_accounts (clés d'accès) sont posées à part, hors
--  dépôt.
--
--  Appareils (noms de l'app Shelly) :
--   Boussoura
--    dcb4d9ce46ec       S3EM-002CXCEU   GENERAL SENELEC (HALL)
--    dcb4d9ce46ec_1                     2) Deuxième Canal IB (sans pièce, hors ligne)
--    ecda3bc52cfc       S3SW-001P8EU    ECLAIRAGE SALON & BALCON
--    80f3dac88e40       SPSW-201PE15UL  Clim salon
--    8cbfea96f340       S3PL-00112EU    Réfrigérateur
--    e4b32318624c       S3SW-001P8EU    ECL Chambre-SDB-Coul et Extracteur SDB
--    14335cc56d54       SPSW-201PE15UL  Clim chambre
--    80f3dac8843c       SPSW-201PE15UL  Chauffe-eau
--    0070074dc008       SPSW-201PE15UL  M1 (Buanderie Terasse)
--    0070074a43a4       SPSW-201PE15UL  M2 (Buanderie Terasse)
--    48f6eeb66448       S3PL-00112EU    Prise Buanderie Badihou 1 (hors ligne)
--    XB194372472047924  SBDW-002C       Porte entrée
--   Babs Ndiaye
--    6825ddd2a69c       SPEM-003CEBEU63 SENELEC (HALL)
--    c8f09e83ea14       SPSW-104PE16EU  CLIM CHAMBRE 1_Visiteur   (hors ligne)
--    c8f09e83ea14_1                     CLIM CHAMBRE_PARENT       (hors ligne)
--    c8f09e83ea14_2                     3) Shelly 4PM (sans nom)  (hors ligne)
--    c8f09e83ea14_3                     CLIM SALON                (hors ligne)
--    a0dd6ca9bacc       SPSW-201PE15UL  CHAUFFE-EAU               (hors ligne)
--
--  Rôles : PROPOSÉS (origine auto, non confirmés) d'après les noms —
--  compteur général = M1_RESEAU, le reste = départs ; voies sans nom et
--  capteur de porte = AUTRE. Câblage à confirmer.
--  Aucune mesure n'est touchée.
-- ============================================================

begin;

-- ── 1. Types absents du catalogue ────────────────────────────
--  SPSW-201PE15UL = Pro 1PM (UL) : sans cette ligne, famille INCONNU.
--  SPEM-003CEBEU63 = Pro 3EM 63 A : reconnu par préfixe dans le poller,
--  ajouté pour ne plus dépendre du filet statique.
insert into shelly_device_types (device_type, device_family) values
  ('SPSW-201PE15UL',  'ENERGIE_1PH'),
  ('SPEM-003CEBEU63', 'ENERGIE_3PH')
on conflict (device_type) do nothing;

-- ── 2. Accès : même organisation que les autres sites CER2E ──
insert into site_organisation (site, organization_id)
select s.site, o.organization_id
  from (values ('Boussoura'), ('Babs Ndiaye')) s(site)
 cross join (select organization_id from site_organisation where site = 'Prestation CER2E') o
on conflict do nothing;

-- ── 3. Voies secondaires ─────────────────────────────────────
insert into shelly_device_channels (parent_device_id, channel_number, channel_name, site)
select v.parent, v.ch, v.nom, v.site
  from (values
    ('dcb4d9ce46ec', 1, '2) Deuxième Canal IB',    'Boussoura'),
    ('c8f09e83ea14', 1, 'CLIM CHAMBRE_PARENT',     'Babs Ndiaye'),
    ('c8f09e83ea14', 2, '3) Shelly 4PM',           'Babs Ndiaye'),
    ('c8f09e83ea14', 3, 'CLIM SALON',              'Babs Ndiaye')
  ) v(parent, ch, nom, site)
 where not exists (select 1 from shelly_device_channels c
                    where c.parent_device_id = v.parent and c.channel_number = v.ch);

-- ── 4. Rôles proposés (à confirmer) ──────────────────────────
insert into shelly_device_roles (device_id, role, libelle, origine, sens_inverse, confirme_at, notes) values
  ('dcb4d9ce46ec',      'M1_RESEAU', 'GENERAL SENELEC',                        'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('dcb4d9ce46ec_1',    'AUTRE',     '2) Deuxième Canal IB',                   'auto', false, null, 'Boussoura. 2e pince du compteur général, sans pièce, hors ligne au 29/10 : usage inconnu.'),
  ('ecda3bc52cfc',      'DEPART',    'ECLAIRAGE SALON & BALCON',               'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('80f3dac88e40',      'DEPART',    'Clim salon',                             'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('8cbfea96f340',      'DEPART',    'Réfrigérateur',                          'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('e4b32318624c',      'DEPART',    'ECL Chambre-SDB-Coul et Extracteur SDB', 'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('14335cc56d54',      'DEPART',    'Clim chambre',                           'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('80f3dac8843c',      'DEPART',    'Chauffe-eau',                            'auto', false, null, 'Boussoura. Rôle proposé d''après le nom.'),
  ('0070074dc008',      'DEPART',    'M1',                                     'auto', false, null, 'Boussoura, Buanderie Terasse. Nom « M1 » sans précision : départ supposé.'),
  ('0070074a43a4',      'DEPART',    'M2',                                     'auto', false, null, 'Boussoura, Buanderie Terasse. Nom « M2 » sans précision : départ supposé.'),
  ('48f6eeb66448',      'DEPART',    'Prise Buanderie Badihou 1',              'auto', false, null, 'Boussoura. Rôle proposé d''après le nom. Hors ligne au 29/10.'),
  ('XB194372472047924', 'AUTRE',     'Porte entrée',                           'auto', false, null, 'Boussoura. Capteur d''ouverture BLU.'),
  ('6825ddd2a69c',      'M1_RESEAU', 'SENELEC',                                'auto', false, null, 'Babs Ndiaye. Rôle proposé d''après le nom.'),
  ('c8f09e83ea14',      'DEPART',    'CLIM CHAMBRE 1_Visiteur',                'auto', false, null, 'Babs Ndiaye. Rôle proposé d''après le nom. Hors ligne au 29/10.'),
  ('c8f09e83ea14_1',    'DEPART',    'CLIM CHAMBRE_PARENT',                    'auto', false, null, 'Babs Ndiaye. Rôle proposé d''après le nom. Hors ligne au 29/10.'),
  ('c8f09e83ea14_2',    'AUTRE',     '3) Shelly 4PM',                          'auto', false, null, 'Babs Ndiaye. Voie sans nom ni pièce : usage inconnu.'),
  ('c8f09e83ea14_3',    'DEPART',    'CLIM SALON',                             'auto', false, null, 'Babs Ndiaye. Rôle proposé d''après le nom. Hors ligne au 29/10.'),
  ('a0dd6ca9bacc',      'DEPART',    'CHAUFFE-EAU',                            'auto', false, null, 'Babs Ndiaye. Rôle proposé d''après le nom. Hors ligne au 29/10.')
on conflict (device_id) do nothing;

-- ── 5. Périodes : à partir du début de collecte des sites ────
insert into shelly_device_periodes (device_id, du, au, site, libelle, statut) values
  ('dcb4d9ce46ec',      '2026-10-29 13:30+00', null, 'Boussoura',   'GENERAL SENELEC',                        'confirme'),
  ('dcb4d9ce46ec_1',    '2026-10-29 13:30+00', null, 'Boussoura',   '2) Deuxième Canal IB',                   'confirme'),
  ('ecda3bc52cfc',      '2026-10-29 13:30+00', null, 'Boussoura',   'ECLAIRAGE SALON & BALCON',               'confirme'),
  ('80f3dac88e40',      '2026-10-29 13:30+00', null, 'Boussoura',   'Clim salon',                             'confirme'),
  ('8cbfea96f340',      '2026-10-29 13:30+00', null, 'Boussoura',   'Réfrigérateur',                          'confirme'),
  ('e4b32318624c',      '2026-10-29 13:30+00', null, 'Boussoura',   'ECL Chambre-SDB-Coul et Extracteur SDB', 'confirme'),
  ('14335cc56d54',      '2026-10-29 13:30+00', null, 'Boussoura',   'Clim chambre',                           'confirme'),
  ('80f3dac8843c',      '2026-10-29 13:30+00', null, 'Boussoura',   'Chauffe-eau',                            'confirme'),
  ('0070074dc008',      '2026-10-29 13:30+00', null, 'Boussoura',   'M1',                                     'confirme'),
  ('0070074a43a4',      '2026-10-29 13:30+00', null, 'Boussoura',   'M2',                                     'confirme'),
  ('48f6eeb66448',      '2026-10-29 13:30+00', null, 'Boussoura',   'Prise Buanderie Badihou 1',              'confirme'),
  ('XB194372472047924', '2026-10-29 13:30+00', null, 'Boussoura',   'Porte entrée',                           'confirme'),
  ('6825ddd2a69c',      '2026-10-29 13:30+00', null, 'Babs Ndiaye', 'SENELEC',                                'confirme'),
  ('c8f09e83ea14',      '2026-10-29 13:30+00', null, 'Babs Ndiaye', 'CLIM CHAMBRE 1_Visiteur',                'confirme'),
  ('c8f09e83ea14_1',    '2026-10-29 13:30+00', null, 'Babs Ndiaye', 'CLIM CHAMBRE_PARENT',                    'confirme'),
  ('c8f09e83ea14_2',    '2026-10-29 13:30+00', null, 'Babs Ndiaye', '3) Shelly 4PM',                          'confirme'),
  ('c8f09e83ea14_3',    '2026-10-29 13:30+00', null, 'Babs Ndiaye', 'CLIM SALON',                             'confirme'),
  ('a0dd6ca9bacc',      '2026-10-29 13:30+00', null, 'Babs Ndiaye', 'CHAUFFE-EAU',                            'confirme');

commit;
