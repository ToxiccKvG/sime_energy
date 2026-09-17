-- ============================================================
--  custom_sensors.quantity_kind — colonne manquante depuis le 23/07/2026
--
--  Le front (commit f2aaf3e1) envoie `quantity_kind` ('power' | 'energy'
--  | 'other') à la sauvegarde d'un capteur personnalisé : c'est la
--  métadonnée qui décide si un cumul a un sens (intégration d'une
--  puissance, somme d'une énergie, rien pour une température ou un ppm).
--  La colonne n'avait jamais été créée → « Could not find the
--  'quantity_kind' column » → « Erreur de sauvegarde [object Object] ».
--
--  'other' par défaut : c'est le choix sûr (aucun cumul affiché) pour les
--  capteurs déjà enregistrés sans cette information.
-- ============================================================

alter table custom_sensors
  add column if not exists quantity_kind text not null default 'other'
  check (quantity_kind in ('power', 'energy', 'other'));

comment on column custom_sensors.quantity_kind is
  'power = puissance instantanée (cumul par intégration), energy = énergie déjà cumulable (somme), other = pas de cumul (T°, ppm, %…).';
