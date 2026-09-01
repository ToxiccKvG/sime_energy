-- ============================================================
--  Correction : le rôle M1 ne doit pas nommer un distributeur
--
--  `M1_SENELEC` inscrivait le distributeur sénégalais dans un
--  vocabulaire de rôles qui doit rester valable pour tous les sites.
--  Le site de Donsin est au Burkina Faso, où le distributeur est la
--  SONABEL : y rattacher « Arrivée générale » en `M1_SENELEC` aurait
--  affirmé une contrevérité dans la donnée elle-même.
--
--  Le rôle décrit une FONCTION dans l'architecture électrique
--  (arrivée réseau public), pas le fournisseur. Le distributeur est
--  un attribut du site, pas de l'appareil — il conditionne les tarifs
--  et devra être porté séparément.
-- ============================================================

alter table shelly_device_roles drop constraint if exists shelly_device_roles_role_check;

update shelly_device_roles set role = 'M1_RESEAU' where role = 'M1_SENELEC';

alter table shelly_device_roles add constraint shelly_device_roles_role_check
  check (role in (
    'M1_RESEAU',    -- arrivée réseau public (SENELEC, SONABEL… selon le pays)
    'M2_SELECTEUR', -- sélecteur / inverseur PV-réseau
    'M3_CHARGE',    -- charge totale du site
    'M4_GROUPE',    -- groupe électrogène
    'M5_PV',        -- production photovoltaïque
    'BESS',         -- batterie de stockage
    'DEPART',       -- départ / sous-charge
    'AMBIANCE',     -- capteur d'ambiance
    'AUTRE'
  ));
