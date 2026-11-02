-- ============================================================
--  custom_sensors : plusieurs séries dans un même fichier
--
--  Un export de table (shelly_cl, portail multi-onduleurs…) range une ligne
--  par horodatage ET par appareil. Lu comme une seule série, les valeurs de
--  tous les appareils se suivaient dans une même courbe (moyennes, maxima et
--  énergie faux, sans message). Le capteur porte désormais la colonne
--  d'appartenance : le backend (sensors.py › _process_series) découpe le
--  fichier en un relevé par valeur ; sans elle, un fichier visiblement
--  multi-séries est refusé avec la colonne à indiquer.
-- ============================================================

alter table custom_sensors
  add column if not exists series_col text,
  add column if not exists series_label_col text;

comment on column custom_sensors.series_col is
  'Colonne qui dit à quelle série appartient chaque ligne (ex. device_id) ; un relevé par valeur. NULL = une seule série.';
comment on column custom_sensors.series_label_col is
  'Colonne du nom affiché de chaque série (ex. name) ; le plus récent est gardé. NULL = la valeur de series_col.';
