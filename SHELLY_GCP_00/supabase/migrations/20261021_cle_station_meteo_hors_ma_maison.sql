-- ============================================================
--  Clé station météo : n'est pas sur le site Ma Maison — 2026-10-21
--
--  Correction de 20261016_retraits_donsin_ma_maison.sql, qui l'avait
--  déclarée « Ma Maison : déconnecté volontairement ». Précision de
--  Maurice (21/10) : la station météo ne se trouve pas sur le site Ma
--  Maison, elle est à Donsin, qui a son propre compte Shelly depuis le
--  09/07/2026. L'appareil b0b21cfaf1a0 est la passerelle Bluetooth
--  (SNGW-BT01) de cette installation, sans mesure électrique ; ses seuls
--  relevés (25/06/2026, environ 1 h, 54 lignes) sont arrivés sous le
--  compte Ma Maison, avant la création du compte Donsin.
--
--  Seul le libellé du retrait change. Aucune mesure n'est modifiée ni
--  supprimée ; l'appareil reste hors des alertes.
-- ============================================================

update shelly_device_retraits
   set motif = 'retire',
       note  = 'Passerelle Bluetooth de la station météo de Donsin (SNGW-BT01), pas sur le site Ma Maison (Maurice, 21/10/2026) : ses 54 relevés du 25/06/2026 sont arrivés sous le compte Ma Maison, avant la création du compte Donsin (09/07/2026).'
 where device_id = 'b0b21cfaf1a0'
   and jusqu_a is null;
