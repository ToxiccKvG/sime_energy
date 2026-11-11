-- ============================================================
--  custom_sensors : colonne heure séparée + signature des colonnes
--
--  time_col : les enregistreurs (loggers H&T…) écrivent DATE et TIME dans
--    deux colonnes. Sans fusion, tous les relevés d'une journée tombaient à
--    minuit. Le backend concatène timestamp_col + ' ' + time_col.
--
--  columns_signature : empreinte des en-têtes du fichier exemple (noms
--    normalisés, triés, joints par '|'). À l'import, un fichier dont les
--    en-têtes ont la même empreinte est rattaché automatiquement à ce
--    capteur — plus besoin de le choisir à la main pour chaque fichier du
--    même appareil.
-- ============================================================

alter table custom_sensors
  add column if not exists time_col text,
  add column if not exists columns_signature text;

create index if not exists custom_sensors_signature_idx
  on custom_sensors (organization_id, columns_signature) where columns_signature is not null;

comment on column custom_sensors.time_col is
  'Colonne heure séparée, fusionnée avec timestamp_col (loggers qui séparent DATE et TIME). NULL si timestamp_col porte déjà l''heure.';
comment on column custom_sensors.columns_signature is
  'Empreinte des en-têtes du fichier exemple (lib/custom-sensor-service.ts › columnsSignature) pour reconnaître automatiquement les fichiers du même appareil.';
