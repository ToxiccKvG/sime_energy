-- ============================================================
--  Détecteurs de présence — trois champs exposés par l'API et jetés
--
--  Le flux `/device/all_status` d'un Shelly Motion Gen1 (SHMOS-02)
--  contient :
--    sensor: { motion, vibration, timestamp, active, is_valid }
--    lux:    { value, illumination }
--  On n'en gardait que `motion` (fusionné avec `vibration`) et `value`.
--
--  · last_event_at : horodatage du DERNIER événement détecté par le
--    capteur lui-même. C'est la donnée d'occupation par excellence —
--    sur le détecteur de l'Académie CER2E il vaut le 2026-07-30, donc
--    ce local n'a rien vu bouger depuis plus d'un mois. L'état courant
--    « no_motion » ne dit rien de tel.
--  · vibration : distincte du mouvement. L'extracteur les fusionnait,
--    on ne pouvait pas distinguer un passage d'une vibration.
--  · illumination : le libellé qualitatif calculé par Shelly
--    (dark / twilight / bright), plus parlant qu'une valeur en lux.
-- ============================================================

alter table shelly_cl add column if not exists last_event_at timestamptz;
alter table shelly_cl add column if not exists vibration     boolean;
alter table shelly_cl add column if not exists illumination  text;

comment on column shelly_cl.last_event_at is
  'Horodatage du dernier événement détecté par le capteur (sensor.timestamp), à distinguer de ts (instant du polling) et de measured_at (dernier envoi du capteur au cloud). Un détecteur peut émettre toutes les heures tout en n''ayant rien détecté depuis des semaines.';
comment on column shelly_cl.vibration is
  'Vibration détectée, distincte du mouvement — les deux étaient fusionnés dans state avant le 2026-09-01.';
comment on column shelly_cl.illumination is
  'Libellé de luminosité calculé par Shelly : dark / twilight / bright.';
