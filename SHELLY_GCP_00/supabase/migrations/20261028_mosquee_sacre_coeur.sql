-- ============================================================
--  Nouveau site « Mosquée Sacré Cœur » — 2026-10-28
--
--  Pièce « Mosquée sacré cœur » du compte Shelly Prestation (même clé,
--  même serveur shelly-98-eu). Collectée comme un site à part : une
--  2e ligne shelly_accounts dont appareils_inclus ne retient que les
--  5 compteurs de la mosquée. La ligne « Prestation CER2E » (pièce
--  SENELEC seule) ne change pas.
--
--  Appareils (noms de l'app Shelly) :
--    08f9e047b1b2   SHEM-3          EM3-01 (ARRIVE GEN RDC+R1)
--    483fdac3d79c   SHEM-3          EM3-02 (RDC+MORGUE
--    34945475f173   SHEM-3          EM3-04 (R1)
--    841fe890f0d0   SPEM-003CEBEU   PRO-EM3-01 (MORGUE)
--    8c4f00dba0c4   SPEM-002CEBEU50 2) PRO-EM-01 (SONO-MONTRE-TV)
--    8c4f00dba0c4_1                 1) PRO-EM-01 (ECL-EXTÉRIEURE)
--
--  08f9e047b1b2 (ex PV_BUILDING COMMUNAL) et 483fdac3d79c (ex
--  M3_CHARGE_CONSOMMATION) viennent de l'Académie : retirés depuis
--  le 02/10 et le 14/08, revus le 27/10 vers 16 h sur le compte
--  Académie (lignes laissées telles quelles), puis passés sur le
--  compte Prestation. Rôle = usage actuel.
--
--  Rôles : PROPOSÉS (origine auto, non confirmés) d'après les noms —
--  EM3-01 = arrivée générale, le reste = départs. Câblage à confirmer.
--  Aucune mesure n'est touchée.
-- ============================================================

begin;

-- ── 1. Compte de collecte (clé reprise de la ligne Prestation) ──
insert into shelly_accounts (site, label, auth_key, server_url, actif, appareils_inclus)
select 'Mosquée Sacré Cœur', 'Prestation — Mosquée Sacré Cœur', auth_key, server_url, true,
       array['08f9e047b1b2', '483fdac3d79c', '34945475f173', '841fe890f0d0', '8c4f00dba0c4']
  from shelly_accounts
 where site = 'Prestation CER2E'
on conflict (site) do nothing;

-- ── 2. Accès : même organisation que les autres sites CER2E ──
insert into site_organisation (site, organization_id)
select 'Mosquée Sacré Cœur', organization_id
  from site_organisation
 where site = 'Prestation CER2E'
on conflict do nothing;

-- ── 3. Canal 2 du Pro EM ─────────────────────────────────────
insert into shelly_device_channels (parent_device_id, channel_number, channel_name, site)
select '8c4f00dba0c4', 1, '1) PRO-EM-01 (ECL-EXTÉRIEURE)', 'Mosquée Sacré Cœur'
 where not exists (select 1 from shelly_device_channels
                    where parent_device_id = '8c4f00dba0c4' and channel_number = 1);

-- ── 4. Rôles proposés (à confirmer) ──────────────────────────
insert into shelly_device_roles (device_id, role, libelle, origine, sens_inverse, confirme_at, notes) values
  ('08f9e047b1b2',   'M1_RESEAU', 'EM3-01 (ARRIVE GEN RDC+R1)',      'auto', false, null,
   'Mosquée Sacré Cœur depuis le 27/10/2026 (ex PV_BUILDING COMMUNAL de l''Académie). Rôle proposé d''après le nom.'),
  ('483fdac3d79c',   'DEPART',    'EM3-02 (RDC+MORGUE',              'auto', false, null,
   'Mosquée Sacré Cœur depuis le 27/10/2026 (ex M3_CHARGE_CONSOMMATION de l''Académie). Rôle proposé d''après le nom.'),
  ('34945475f173',   'DEPART',    'EM3-04 (R1)',                     'auto', false, null, 'Mosquée Sacré Cœur. Rôle proposé d''après le nom.'),
  ('841fe890f0d0',   'DEPART',    'PRO-EM3-01 (MORGUE)',             'auto', false, null, 'Mosquée Sacré Cœur. Rôle proposé d''après le nom.'),
  ('8c4f00dba0c4',   'DEPART',    '2) PRO-EM-01 (SONO-MONTRE-TV)',   'auto', false, null, 'Mosquée Sacré Cœur. Rôle proposé d''après le nom.'),
  ('8c4f00dba0c4_1', 'DEPART',    '1) PRO-EM-01 (ECL-EXTÉRIEURE)',   'auto', false, null, 'Mosquée Sacré Cœur. Rôle proposé d''après le nom.')
on conflict (device_id) do update
   set role = excluded.role, libelle = excluded.libelle, origine = excluded.origine,
       sens_inverse = excluded.sens_inverse, confirme_at = null, confirme_par = null,
       notes = excluded.notes, updated_at = now();

-- ── 5. Retraits Académie clos au retour des deux compteurs ───
update shelly_device_retraits set jusqu_a = '2026-10-27 15:59:00+00'
 where device_id = '08f9e047b1b2' and jusqu_a is null;
update shelly_device_retraits set jusqu_a = '2026-10-27 17:00:00+00'
 where device_id = '483fdac3d79c' and jusqu_a is null;

-- ── 6. Périodes : à partir du début de collecte du site ──────
insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes) values
  ('08f9e047b1b2',   '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', 'EM3-01 (ARRIVE GEN RDC+R1)',    'confirme',
   'Installé le 27/10 vers 16 h (lignes du 27/10 restées sous Académie CER2E). Collecte du site depuis le 28/10.'),
  ('483fdac3d79c',   '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', 'EM3-02 (RDC+MORGUE',            'confirme',
   'Installé le 27/10 vers 17 h (lignes du 27/10 restées sous Académie CER2E). Collecte du site depuis le 28/10.'),
  ('34945475f173',   '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', 'EM3-04 (R1)',                   'confirme', null),
  ('841fe890f0d0',   '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', 'PRO-EM3-01 (MORGUE)',           'confirme', null),
  ('8c4f00dba0c4',   '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', '2) PRO-EM-01 (SONO-MONTRE-TV)', 'confirme', null),
  ('8c4f00dba0c4_1', '2026-10-28 13:55+00', null, 'Mosquée Sacré Cœur', '1) PRO-EM-01 (ECL-EXTÉRIEURE)', 'confirme', null);

commit;
