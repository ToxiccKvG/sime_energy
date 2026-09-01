-- ============================================================
--  Catalogue des appareils — restreint aux appareils encore vus
--
--  Problème : shelly_devices_catalog (migration 20260827) liste tout
--  appareil ayant au moins une ligne dans shelly_cl. Le site suspendu
--  « Prestation CER2E » (arrêté le 2026-05-27) réapparaissait donc avec
--  ses 17 appareils dans les sélecteurs de l'onglet Analyse, alors que
--  la liste codée en dur qu'elle remplace en avait été purgée à la main.
--
--  La rétention documentée dans schema.sql (90 jours) n'étant planifiée
--  par aucun job cron, shelly_cl conserve 137 jours d'historique : rien
--  ne fait donc disparaître un site inactif. On aligne ici le catalogue
--  sur cette fenêtre de 90 jours, sans rien supprimer — les données
--  restent intactes et interrogeables par device_id.
-- ============================================================

drop materialized view if exists shelly_devices_catalog;

create materialized view shelly_devices_catalog as
select distinct on (device_id)
  device_id,
  name,
  site,
  room,
  device_type,
  device_family,
  ts as derniere_lecture
from shelly_cl
where ts >= now() - interval '90 days'
order by device_id, ts desc;

-- Index unique requis pour REFRESH ... CONCURRENTLY (pas de blocage des lectures)
create unique index if not exists shelly_devices_catalog_device_id_idx
  on shelly_devices_catalog (device_id);

comment on materialized view shelly_devices_catalog is
  'Une ligne par appareil Shelly vu au cours des 90 derniers jours, avec ses métadonnées les plus récentes. Remplace la liste KNOWN_SHELLY_DEVICES codée en dur côté frontend. La fenêtre de 90 jours écarte les sites/appareils définitivement arrêtés (ex. Prestation CER2E) sans supprimer leurs données. Rafraîchie chaque heure par le job cron refresh-shelly-devices-catalog.';

-- Une vue matérialisée ne supporte pas la RLS : les privilèges par défaut de
-- Supabase (ALL à anon + authenticated) exposeraient les noms d'appareils et de
-- sites à un visiteur non authentifié, alors que shelly_cl exige `authenticated`.
revoke all on shelly_devices_catalog from anon, authenticated;
grant select on shelly_devices_catalog to authenticated;

-- Le job de rafraîchissement (20260827) reste en place et repointe
-- automatiquement sur la vue recréée.
