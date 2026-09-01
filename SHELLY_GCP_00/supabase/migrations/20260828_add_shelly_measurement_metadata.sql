-- ============================================================
--  Capture exhaustive des capteurs — métadonnées de mesure
--
--  Contexte : /device/all_status accompagne chaque appareil de champs
--  jamais stockés, dont l'absence fausse l'analyse des capteurs de
--  température :
--
--   * `_updated` — horodatage réel (UTC) du dernier relevé remonté au
--     cloud. Les capteurs H&T dorment entre deux mesures (Gen3 :
--     sys.wakeup_period = 7200 s, BLU : émission sur variation) alors
--     que poll-shelly écrit une ligne par minute avec ts = now(). Sans
--     `measured_at`, impossible de distinguer une nouvelle mesure d'une
--     relecture de la précédente : une valeur figée pendant 2 h pesait
--     120 fois dans une moyenne horaire.
--   * `online` — l'appareil répond-il réellement, par opposition aux
--     lignes state='offline' posées par le fallback de poll-shelly.
--   * `firmware_version`, `battery_low` — diagnostic capteur.
-- ============================================================

alter table shelly_cl add column if not exists measured_at      timestamptz;
alter table shelly_cl add column if not exists online           boolean;
alter table shelly_cl add column if not exists firmware_version text;
alter table shelly_cl add column if not exists battery_low      boolean;

comment on column shelly_cl.measured_at is
  'Horodatage Shelly (_updated) du relevé lui-même, à distinguer de ts qui est l''instant du polling. Pour un capteur endormi, plusieurs lignes ts consécutives partagent le même measured_at.';
comment on column shelly_cl.online is
  'Appareil joignable au moment du poll (_dev_info.online pour le BLE, cloud.connected sinon). NULL = information non fournie par le modèle.';

-- ── Types de matériel non classés ───────────────────────────────────────
--
--  Ces modèles retombaient sur device_family = 'INCONNU', qui n'a aucun
--  extracteur : leurs lignes ne contenaient que l'identité de l'appareil.
--  Deux d'entre eux mesurent pourtant une température (champ Gen1 `tmp`) :
--   - SHWT-1  détecteur d'eau       (Académie CER2E — 31 °C jamais stockés)
--   - SHHT-1  H&T Gen1
--  Les deux autres sont des capteurs d'état (alarme + batterie).
insert into shelly_device_types (device_type, device_family, label) values
  ('SHWT-1',     'CAPTEUR_ENV', 'Détecteur d''eau Gen1 (mesure aussi la température)'),
  ('SHHT-1',     'CAPTEUR_ENV', 'Capteur température/humidité Gen1'),
  ('S3SN-0U53X', 'CAPTEUR_ENV', 'Capteur température/humidité (The Pill)'),
  ('SNSN-0031Z', 'ETAT',        'Détecteur de fumée'),
  ('SHSM-01',    'ETAT',        'Détecteur de fumée Gen1')
on conflict (device_type) do nothing;
