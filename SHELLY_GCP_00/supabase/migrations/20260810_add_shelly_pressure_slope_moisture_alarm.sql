-- ============================================================
--  Ajout de 2 champs météo remontés par l'API Shelly Cloud pour
--  les stations météo BLU (ex: Station météo_Donsin) mais pas
--  encore captés par poll-shelly :
--   - pressure_slope : tendance de pression (rising/falling/steady)
--   - moisture_alarm : alarme pluie/humidité détectée (bool)
-- ============================================================

alter table shelly_cl add column if not exists pressure_slope text;
alter table shelly_cl add column if not exists moisture_alarm boolean;
