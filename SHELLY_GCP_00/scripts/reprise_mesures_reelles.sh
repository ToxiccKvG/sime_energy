#!/bin/zsh
# ============================================================
# Recalcul de shelly_cl_horaire.nb_mesures_reelles sur tout l'historique,
# mois par mois (environ 47 s par mois) : un appel par mois, pour rester
# sous la limite de temps de l'API Supabase (~100 s par requête).
# Prérequis : migration 20261016_mesures_reelles.sql appliquée.
# Ne modifie que la colonne nb_mesures_reelles ; shelly_cl n'est pas touchée.
# ============================================================
set -e
cd "$(dirname "$0")/.."
for debut fin in \
  2026-04-01 2026-05-01 \
  2026-05-01 2026-06-01 \
  2026-06-01 2026-07-01 \
  2026-07-01 2026-08-01 \
  2026-08-01 2026-09-01 \
  2026-09-01 2026-10-01 \
  2026-10-01 2026-11-01
do
  echo "→ $debut … $fin"
  supabase db query --linked --agent=no \
    "select fn_reprise_mesures_reelles('$debut', '$fin') as heures_mises_a_jour;" 2>&1 \
    | grep -v "Initialising\|new version\|recommend updating"
done
echo "Terminé. Heures encore sans valeur :"
supabase db query --linked --agent=no \
  "select count(*) from shelly_cl_horaire where nb_mesures_reelles is null;" 2>&1 \
  | grep -v "Initialising\|new version\|recommend updating"
