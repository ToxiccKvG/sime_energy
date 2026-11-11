#!/bin/zsh
# ============================================================
# Recalcul de wh_conso et wh_inj de shelly_cl_horaire sur tout l'historique,
# par tranches de 10 jours : un mois prend près de 100 s, la limite de l'API
# Supabase par requête.
# Prérequis : migration 20261104_energie_horaire_increments.sql appliquée.
# Sauvegarde d'abord les valeurs actuelles dans le schéma backup.
# Ne modifie que ces deux colonnes ; shelly_cl n'est pas touchée.
# Retour arrière : voir la fin de la migration citée ci-dessus.
# ============================================================
set -e
cd "$(dirname "$0")/.."
requete() {
  local sortie
  # Une erreur SQL arrête le script ; une commande sans résultat à afficher, non
  sortie=$(supabase db query --linked --agent=no "$1" </dev/null 2>&1) || { print -r -- "$sortie"; return 1; }
  print -r -- "$sortie" | grep -v "Initialising\|new version\|recommend updating" || true
}

requete "create table if not exists backup.shelly_cl_horaire_energie_20261104 as
         select id, ts_heure, device_id, wh_conso, wh_inj from shelly_cl_horaire;"
echo "Sauvegarde :"
requete "select count(*) from backup.shelly_cl_horaire_energie_20261104;"

debut=2026-04-16
fin=$(date -u +%Y-%m-%d)
while [[ "$debut" < "$fin" ]]; do
  suivant=$(date -j -u -v+10d -f %Y-%m-%d "$debut" +%Y-%m-%d)
  echo "→ $debut … $suivant"
  requete "select fn_reprise_energie_horaire('$debut', '$suivant') as heures_modifiees;"
  debut=$suivant
done
echo "Terminé."
