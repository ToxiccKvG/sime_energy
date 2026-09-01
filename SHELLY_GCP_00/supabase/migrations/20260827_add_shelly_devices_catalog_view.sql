-- ============================================================
--  Catalogue des appareils — une ligne par device_id, avec ses
--  métadonnées les plus récentes (nom, site, pièce, famille).
--
--  Contexte : le frontend construisait la liste des appareils
--  (sélecteurs Site / Famille / Appareil de l'onglet Analyse) à
--  partir d'un tableau KNOWN_SHELLY_DEVICES codé en dur dans
--  iot-supabase-service.ts. Cette liste devient fausse dès qu'un
--  appareil est renommé ou déplacé de site côté Shelly Cloud :
--  ex. `441d6475d44c` = "Compteur 2" / Académie CER2E en dur,
--  alors qu'il collecte depuis "Arrivée générale" / Donsin.
--  Un nouvel appareil n'apparaissait jamais dans l'UI.
--
--  Matérialisée : un DISTINCT ON sur shelly_cl (90 jours de
--  relevés à la minute, plusieurs millions de lignes) dépasse le
--  statement_timeout de PostgREST à chaque appel. On calcule donc
--  le catalogue une fois par heure via pg_cron.
-- ============================================================

drop view if exists shelly_devices_catalog;

create materialized view if not exists shelly_devices_catalog as
select distinct on (device_id)
  device_id,
  name,
  site,
  room,
  device_type,
  device_family,
  ts as derniere_lecture
from shelly_cl
order by device_id, ts desc;

-- Index unique requis pour REFRESH ... CONCURRENTLY (pas de blocage des lectures)
create unique index if not exists shelly_devices_catalog_device_id_idx
  on shelly_devices_catalog (device_id);

comment on materialized view shelly_devices_catalog is
  'Une ligne par appareil Shelly avec ses métadonnées les plus récentes. Remplace la liste KNOWN_SHELLY_DEVICES codée en dur côté frontend, qui ne suivait pas les renommages/déplacements de site. Rafraîchie chaque heure par le job cron refresh-shelly-devices-catalog.';

-- Une vue matérialisée ne supporte pas la RLS : les privilèges par défaut de
-- Supabase (ALL à anon + authenticated) exposeraient donc les noms d'appareils
-- et de sites à un visiteur non authentifié, alors que shelly_cl exige
-- `authenticated`. On repart de zéro et on n'accorde que la lecture, au seul
-- rôle authentifié — cohérent avec la policy shelly_cl_authenticated_read.
revoke all on shelly_devices_catalog from anon, authenticated;
grant select on shelly_devices_catalog to authenticated;

-- ── Rafraîchissement horaire ────────────────────────────────
select cron.unschedule('refresh-shelly-devices-catalog')
where exists (
  select 1 from cron.job where jobname = 'refresh-shelly-devices-catalog'
);

select cron.schedule(
  'refresh-shelly-devices-catalog',
  '10 * * * *',
  $$refresh materialized view concurrently shelly_devices_catalog$$
);
