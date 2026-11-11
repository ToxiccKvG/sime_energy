-- ============================================================
--  Prestation CER2E et Boussoura : deux sites distincts — 2026-11-02
--
--  Annule 20261102_senelec_boussara_vers_boussoura.sql. Précision de
--  Maurice : le compte Boussoura mesure les usages de son domicile ; le
--  compteur 08f9e0e4d080 du compte Prestation mesure autre chose. Le
--  partage de ce compteur dans le compte Boussoura (01/11 ~07:28 UTC)
--  ne doit pas le faire changer de site.
--
--   1. Ligne « Prestation CER2E » réactivée (appareils_inclus inchangé).
--   2. Boussoura limité aux 12 appareils de son domicile : un appareil
--      ajouté plus tard au compte devra être ajouté à cette liste.
--   3. Périodes et canal 2 remis sous Prestation CER2E.
--
--  Aucune mesure à restaurer : tout l'historique du compteur est sous
--  Prestation CER2E (dernier relevé le 02/11 08:21 UTC) ; les lignes
--  supprimées le matin étaient des copies (sauvegarde gardée dans
--  backup.boussoura_doublon_prestation_20261102).
-- ============================================================

begin;

-- ── 1. Prestation CER2E ──────────────────────────────────────
update shelly_accounts set actif = true, updated_at = now()
 where site = 'Prestation CER2E';

-- ── 2. Boussoura : appareils du domicile seulement ───────────
update shelly_accounts
   set appareils_inclus = array['dcb4d9ce46ec', 'ecda3bc52cfc', '80f3dac88e40', '8cbfea96f340',
                                'e4b32318624c', '14335cc56d54', '80f3dac8843c', '0070074dc008',
                                '0070074a43a4', '48f6eeb66448', 'XB194372472047924'],
       updated_at = now()
 where site = 'Boussoura';

-- ── 3. Périodes et canal 2 ───────────────────────────────────
delete from shelly_device_periodes
 where device_id in ('08f9e0e4d080', '08f9e0e4d080_1') and site = 'Boussoura';

update shelly_device_periodes set au = null, updated_at = now()
 where device_id in ('08f9e0e4d080', '08f9e0e4d080_1')
   and site = 'Prestation CER2E' and au = '2026-11-02 09:45+00';

update shelly_device_channels set site = 'Prestation CER2E', updated_at = now()
 where parent_device_id = '08f9e0e4d080' and channel_number = 1;

commit;
