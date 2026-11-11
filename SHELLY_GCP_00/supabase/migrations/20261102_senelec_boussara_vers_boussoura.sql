-- ============================================================
--  Shelly EM 08f9e0e4d080 : Prestation CER2E → Boussoura — 2026-11-02
--
--  Le 01/11 vers 07:28 UTC, le compteur de la pièce SENELEC de
--  Mme Boussara (compte Prestation) a été PARTAGÉ dans le compte
--  Boussoura (nom de l'app : « 1) Boussoura SENELEC from
--  prestation@cer2e.com »). Le compte Boussoura étant collecté en
--  entier, le compteur était lu deux fois : sous Prestation CER2E et
--  sous Boussoura (≈ 600 lignes en double par voie).
--
--  Décision de Maurice (02/11) : collecter ce compteur sous Boussoura
--  seulement.
--   1. Ligne « Prestation CER2E » désactivée (elle ne collectait que ce
--      compteur). Son historique reste en base.
--   2. Copies Boussoura antérieures à la bascule supprimées (sauvegarde
--      dans backup.boussoura_doublon_prestation_20261102) : il reste une
--      ligne par minute, sous Prestation CER2E.
--   3. Périodes : Prestation CER2E close à la bascule, Boussoura ouverte.
--   4. Canal 2 rattaché au site Boussoura.
--
--  Bascule : 2026-11-02 09:45 UTC. Le compteur est muet depuis 08:21
--  ce jour-là (deux sites confondus).
--  Le rôle M1_RESEAU (confirmé le 26/10) ne change pas : Boussoura a
--  donc deux M1_RESEAU (GENERAL SENELEC dcb4d9ce46ec et celui-ci),
--  câblage à confirmer.
-- ============================================================

begin;

-- ── 1. Plus de collecte via le compte Prestation ─────────────
update shelly_accounts set actif = false, updated_at = now()
 where site = 'Prestation CER2E';

-- ── 2. Doublons sous Boussoura ───────────────────────────────
create table if not exists backup.boussoura_doublon_prestation_20261102 as
select * from shelly_cl
 where site = 'Boussoura' and device_id in ('08f9e0e4d080', '08f9e0e4d080_1')
   and ts < '2026-11-02 09:45+00';

delete from shelly_cl
 where site = 'Boussoura' and device_id in ('08f9e0e4d080', '08f9e0e4d080_1')
   and ts < '2026-11-02 09:45+00';

-- ── 3. Périodes ──────────────────────────────────────────────
update shelly_device_periodes set au = '2026-11-02 09:45+00', updated_at = now()
 where device_id in ('08f9e0e4d080', '08f9e0e4d080_1')
   and site = 'Prestation CER2E' and au is null;

insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes) values
  ('08f9e0e4d080',   '2026-11-02 09:45+00', null, 'Boussoura', 'SENELEC Mme Boussara',           'confirme',
   'Partagé depuis le compte Prestation dans le compte Boussoura le 01/11 vers 07:28 UTC ; collecté sous Boussoura seulement depuis le 02/11 09:45.'),
  ('08f9e0e4d080_1', '2026-11-02 09:45+00', null, 'Boussoura', 'SENELEC Mme Boussara (canal 2)', 'confirme', null);

-- ── 4. Canal 2 ───────────────────────────────────────────────
update shelly_device_channels set site = 'Boussoura', updated_at = now()
 where parent_device_id = '08f9e0e4d080' and channel_number = 1;

commit;
