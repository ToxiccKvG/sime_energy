-- ============================================================
--  Prestation CER2E (pièce SENELEC) + Bureau CER2E Dakar — 2026-10-26
--
--  1. Shelly EM 08f9e0e4d080 : ex « M4_Groupe électrogène » de l'Académie
--     (relevés du 16/04 au 01/09, puis débranché), réinstallé chez
--     Mme Boussara (compte Shelly « Prestation CER2E », pièce SENELEC).
--     Premier relevé du cloud : 30/09/2026 12:00 UTC.
--     → rôle = usage actuel (arrivée réseau), l'historique Académie est
--       porté par les périodes (même traitement que 441d6475d44c).
--     → le retrait « déconnecté volontairement » du 01/09 est clos au 30/09.
--  2. Bureau Dakar, 3 noms corrigés dans l'app Shelly (simples
--     corrections, confirmé par Maurice) : la période en cours prend le
--     nom juste et devient « confirme ». Les périodes passées ne bougent pas.
--  3. Bureau Dakar, 543204b91840 « Ventilateur_2 » : prise de la mission
--     Prestation (« Climatiseur_Salon », 18→27/05), branchée à Dakar le
--     26/10 vers 14:30 UTC.
--
--  La ligne shelly_accounts du compte Prestation (clé d'accès) est posée
--  à part, hors dépôt : appareils_inclus = {08f9e0e4d080}.
--  Aucune mesure n'est touchée.
-- ============================================================

begin;

-- ── 1. Shelly EM de la pièce SENELEC (Prestation) ────────────
update shelly_device_roles
   set role = 'M1_RESEAU',
       libelle = case device_id when '08f9e0e4d080' then 'SENELEC Mme Boussara'
                                else 'SENELEC Mme Boussara (canal 2)' end,
       origine = 'manuel', confirme_at = now(), updated_at = now(),
       notes = 'Déplacé le 30/09/2026 : ex M4_Groupe électrogène de l''Académie (16/04→01/09), '
            || 'désormais arrivée SENELEC de Mme Boussara (compte Prestation CER2E, pièce SENELEC).'
 where device_id in ('08f9e0e4d080', '08f9e0e4d080_1');

update shelly_device_retraits
   set jusqu_a = '2026-09-30 12:00:00+00'
 where device_id in ('08f9e0e4d080', '08f9e0e4d080_1') and jusqu_a is null;

update shelly_device_channels
   set channel_name = 'SENELEC Mme Boussara (canal 2)', site = 'Prestation CER2E', updated_at = now()
 where parent_device_id = '08f9e0e4d080' and channel_number = 1;

insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes) values
  ('08f9e0e4d080',   '2026-04-16 11:00+00', '2026-09-01 12:00+00', 'Académie CER2E',   'M4_Groupe électrogène',           'confirme', null),
  ('08f9e0e4d080_1', '2026-04-16 11:00+00', '2026-09-01 12:00+00', 'Académie CER2E',   'M4_Groupe électrogène (canal 2)', 'confirme', null),
  ('08f9e0e4d080',   '2026-09-30 12:00+00', null,                  'Prestation CER2E', 'SENELEC Mme Boussara',            'confirme', 'Pièce SENELEC du compte Shelly Prestation. Du 30/09 au 25/10 : historique horaire seulement (API cloud), pas de relevés minute.'),
  ('08f9e0e4d080_1', '2026-09-30 12:00+00', null,                  'Prestation CER2E', 'SENELEC Mme Boussara (canal 2)',  'confirme', 'Pince à 0 Wh sur toute la période 30/09→25/10.');

-- ── 2. Bureau Dakar : corrections de nom ──────────────────────
with noms(device_id, nom) as (values
  ('206ef102b9c4_1', '2) FONTAINE A EAU'),
  ('206ef102b9c4_2', '3) Home assistant'),
  ('543204ba4b18',   'Prise Bureau')
), roles as (
  update shelly_device_roles r set libelle = n.nom, updated_at = now()
    from noms n where r.device_id = n.device_id
  returning r.device_id
)
update shelly_device_periodes p
   set libelle = n.nom, statut = 'confirme', updated_at = now(),
       notes = coalesce(p.notes || ' ', '') || 'Nom corrigé le 26/10/2026 (simple correction, même appareil).'
  from noms n
 where p.device_id = n.device_id and p.site = 'Bureau CER2E Dakar' and p.au is null;

update shelly_device_channels c
   set channel_name = v.nom, updated_at = now()
  from (values (1, '2) FONTAINE A EAU'), (2, '3) Home assistant')) v(ch, nom)
 where c.parent_device_id = '206ef102b9c4' and c.channel_number = v.ch;

-- ── 3. Bureau Dakar : Ventilateur_2 (ex Climatiseur_Salon) ───
insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes) values
  ('543204b91840', '2026-05-18 13:00+00', '2026-05-27 09:00+00', 'Prestation CER2E',   'Climatiseur_Salon', 'confirme', null),
  ('543204b91840', '2026-10-26 14:00+00', null,                  'Bureau CER2E Dakar', 'Ventilateur_2',     'confirme', null);

insert into shelly_device_roles (device_id, role, libelle, origine, confirme_at, notes)
values ('543204b91840', 'DEPART', 'Ventilateur_2', 'manuel', now(),
        'Prise du Bureau CER2E Dakar depuis le 26/10/2026 (ex Climatiseur_Salon, mission Prestation 18→27/05).')
on conflict (device_id) do nothing;

commit;
