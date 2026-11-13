-- ─────────────────────────────────────────────────────────────────────────────
-- Vue de lecture des factures SENELEC par projet, pour l'analyse de données (IoT…)
--
-- Une ligne par facture, toujours à jour (pas de snapshot), enrichie du nom du
-- projet / site / bâtiment et d'un mois de période normalisé.
-- security_invoker : la RLS de factures_senelec / audits s'applique à l'appelant.
-- Doc : sime-front/docs/project-context-json.md
-- ─────────────────────────────────────────────────────────────────────────────



  f.audit_id,
  a.name                                        AS projet_nom,
  f.classeur_site_id                            AS site_id,
  s.name                                        AS site_nom,
  f.classeur_building_id                        AS batiment_id,
  b.building_name                               AS batiment_nom,
  f.numero_compte_contrat,
  f.numero_compteur,
  f.numero_facture,
  f.categorie_tarifaire,
  f.type_tarif_texte,
  f.type_client_texte,
  f.puissance_souscrite_kw,
  f.puissance_transfo,
  f.date_debut_periode,
  f.date_fin_periode,
  date_trunc('month', f.date_debut_periode)::date AS mois_periode,
  f.nb_jour_facturation,
  f.annee_facturation,
  f.mois_facturation,
  f.cons_k1                                     AS conso_k1_kwh,
  f.cons_k2                                     AS conso_k2_kwh,
  f.cons_t                                      AS conso_t_kwh,
  f.consommation_facturee                       AS conso_facturee_kwh,
  f.cons_wr,
  f.ancien_index_k1, f.nouvel_index_k1,
  f.ancien_index_k2, f.nouvel_index_k2,
  f.ancien_index_reactif, f.nouvel_index_reactif,
  f.ancien_index_h1, f.nouvel_index_h1,
  f.heure_h1, f.heure_h2,
  f.puissance_max_kw,
  f.puissance_max_relevee,
  f.valeur_cosinus_phi                          AS cos_phi,
  f.montant_energie_k1,
  f.montant_energie_k2,
  f.montant_total_energie,
  f.montant_prime_fixe,
  f.montant_cosinus_phi,
  f.penalites_depassement,
  f.montant_redevance,
  f.montant_tco,
  f.montant_hors_tva,
  f.montant_tva,
  f.montant_facture_ttc,
  f.rappel_et_majoration,
  f.is_quarantined                              AS en_quarantaine,
  f.quarantine_reason                           AS motif_quarantaine,
  f.created_at
FROM public.factures_senelec f
JOIN public.audits a               ON a.id = f.audit_id
LEFT JOIN public.audit_sites s     ON s.id = f.classeur_site_id
LEFT JOIN public.audit_buildings b ON b.id = f.classeur_building_id;

COMMENT ON VIEW public.v_factures_senelec_projet IS
  'Factures SENELEC par projet (une ligne par facture), lecture seule, RLS de l''appelant. Voir sime-front/docs/project-context-json.md.';

-- Lecture seule : les privilèges par défaut du schéma public donnent aussi INSERT/UPDATE/DELETE
REVOKE ALL ON public.v_factures_senelec_projet FROM anon, authenticated;
GRANT SELECT ON public.v_factures_senelec_projet TO authenticated;
