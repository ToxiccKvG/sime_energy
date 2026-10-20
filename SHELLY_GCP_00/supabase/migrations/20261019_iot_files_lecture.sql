-- Fichiers IOT : lecture d'un fichier hors formats Shelly (19/10/2026)
-- Colonne date/heure, ordre jour/mois, rôle et unité de chaque colonne,
-- choisis à l'import et rejoués par l'Analyse (lib/iot-lecture-fichier.ts).
-- NULL pour les fichiers Shelly reconnus et les fichiers importés avant.
alter table public.iot_files add column if not exists lecture jsonb;
