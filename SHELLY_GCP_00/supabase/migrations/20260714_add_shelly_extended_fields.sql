-- ============================================================
--  Extension shelly_cl — capture exhaustive des données Shelly
--  Contexte : la station météo (SBWS-90CM), les capteurs BLU et les
--  compteurs d'énergie exposent bien plus que temp/hum/power_w dans
--  leur payload brut ; ces champs étaient reçus puis jetés faute de
--  colonnes. Voir shelly_device_config pour le mapping des types.
-- ============================================================

-- Station météo (SBWS-90CM) — champs bruts non capturés jusqu'ici
alter table shelly_cl add column if not exists uv_index         float;
alter table shelly_cl add column if not exists illuminance_lux  float;
alter table shelly_cl add column if not exists wind_speed_ms    float;
alter table shelly_cl add column if not exists wind_gust_ms     float;
alter table shelly_cl add column if not exists wind_direction_deg float;
alter table shelly_cl add column if not exists pressure_hpa     float;
alter table shelly_cl add column if not exists precipitation_mm float;
alter table shelly_cl add column if not exists dewpoint_c       float;
alter table shelly_cl add column if not exists feels_like_c     float;  -- calculé (indice de chaleur / refroidissement éolien), absent du flux Shelly

-- Diagnostics communs à tous les appareils BLU/Wi-Fi
alter table shelly_cl add column if not exists battery_voltage_v float;
alter table shelly_cl add column if not exists signal_rssi      integer;

-- Capteurs porte/fenêtre (SBDW-002C)
alter table shelly_cl add column if not exists tilt_angle       float;

-- Compteurs d'énergie — température interne du relais + fréquence secteur
alter table shelly_cl add column if not exists device_temp_c    float;
alter table shelly_cl add column if not exists frequency_hz     float;

comment on column shelly_cl.feels_like_c is 'Calculé côté poll-shelly (indice de chaleur NOAA si T>=27°C, refroidissement éolien si T<=10°C, sinon = temperature) — pas un champ natif Shelly.';
