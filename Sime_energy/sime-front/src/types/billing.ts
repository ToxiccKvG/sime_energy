import type { TariffCategory, TariffYear, MTCategory } from '@/constants/senelec-tariffs'

// ── Paramètres contractuels SENELEC (1 par audit+site) ──
export interface BillingParams {
  categorie:              TariffCategory
  grille_annee:           TariffYear
  puissance_souscrite_kw: number
  periode_jours:          number        // NJ : durée réelle de la période facturée
  has_transformateur?:    boolean
  puissance_transfo_kva?: number
  comptage_position?:     'primaire' | 'secondaire'
  tco_applicable?:        boolean
  tva_applicable?:        boolean
}

// ── Données extraites d'une facture SENELEC (OCR ou saisie) ──
export interface InvoiceData {
  conso_kwh_total:       number         // kWh total de la période
  conso_k1_kwh?:         number         // kWh hors pointe facturés (GP/MT) — col QUANTITE K1
  conso_k2_kwh?:         number         // kWh pointe facturés (GP/MT) — col QUANTITE K2
  montant_energie?:      number         // FCFA — montant K1 + K2 (énergie seule)
  montant_prime_fixe?:   number         // FCFA — prime fixe mensuelle
  montant_pdp?:          number         // FCFA — pénalité dépassement puissance
  montant_cosphi?:       number         // FCFA — pénalité (>0) ou bonification (<0) cosφ
  montant_tva?:          number         // FCFA
  montant_tco?:          number         // FCFA — taxe communale
  montant_redevance?:    number         // FCFA — location compteur
  montant_ttc:           number         // FCFA — montant total TTC
  montant_ht?:           number         // FCFA — total HT (avant TVA, toutes lignes)
  puissance_max_kw?:     number         // kW — Pmax relevée sur la période
  depassement_kw?:       number         // kW — dépassement PS (Pmax - PS, depuis entête)
  cosphi_mesure?:        number         // cosφ mesuré (depuis entête technique)
  energie_reactive_kvarh?: number       // kVarh — énergie réactive (depuis matrice)
  heures_transfo_h1?:    number         // h — heures transformateur H1 sur la période

  // Détail K1/K2 — tableau de facturation 4 colonnes (GP/MT)
  k1_tarif?:             number         // FCFA/kWh — tarif unitaire heures hors pointe
  k2_tarif?:             number         // FCFA/kWh — tarif unitaire heures de pointe
  k1_montant?:           number         // FCFA — montant ligne Energie K1
  k2_montant?:           number         // FCFA — montant ligne Energie K2
  tarif_prime_fixe?:     number         // FCFA/kW/mois — tarif prime fixe appliqué
  tarif_pdp?:            number         // FCFA/kW — tarif pénalité dépassement PS
  taux_cosphi_pct?:      number         // % — taux bonification/pénalité cosφ
  taux_tva_pct?:         number         // % — taux TVA appliqué

  // Majorations (depuis matrice énergie)
  majoration_k1_kwh?:    number         // kWh — majorations appliquées sur K1
  majoration_k2_kwh?:    number         // kWh — majorations appliquées sur K2

  // Champs contractuels extraits de l'entête OCR
  type_abonnement_raw?:   string        // texte brut (ex: "DGP", "DOMESTIQUE GRANDE PUISSANCE")
  domaine_tension_raw?:   string        // texte brut (ex: "BT", "MT", "HT")
  puissance_souscrite_kw?: number       // PS en kW (depuis entête)

  // Champs auxiliaires
  periode_jours_ocr?:    number
  total_facture_ocr?:    number         // "TOTAL FACTURE" OCR (sans arriérés) — détection arriérés

  // Tranches BT — tableau OCR (1ère / 2ème / 3ème tranche)
  // Disponibles uniquement sur factures DPP/DMP/PPP/PMP
  tranche1_kwh?:         number
  tranche1_tarif?:       number         // FCFA/kWh
  tranche1_montant?:     number         // FCFA
  tranche2_kwh?:         number
  tranche2_tarif?:       number
  tranche2_montant?:     number
  tranche3_kwh?:         number
  tranche3_tarif?:       number
  tranche3_montant?:     number
}

// ── 17 indicateurs de performance calculés ──
export interface BillingKPIs {
  // Normalisation temporelle
  conso_journaliere_kwh:  number
  conso_annuelle_kwh:     number
  cout_journalier_fcfa:   number
  cout_annuel_fcfa:       number

  // Coûts unitaires
  cm_fcfa_kwh:            number        // Coût moyen pondéré (K1×20 + K2×4) / 24
  ipr_fcfa_kwh:           number        // IPR = MTTC / Conso_totale
  surcout_kwh_fcfa:       number        // IPR - Cm
  surcout_monetaire_fcfa: number        // (IPR - Cm) × Conso_totale

  // Indicateurs puissance
  taux_charge_transfo_pct?: number      // [(Pmax/cosφ_défaut) / Smax] × 100 (MT)
  facteur_utilisation_pct:  number      // [Conso_jour / (Pmax × 24)] × 100
  nb_heures_utilisation:    number      // Conso_annuelle / PS

  // Répartition facture — pourcentages (segments pie)
  pct_energie:           number
  pct_prime_fixe:        number    // prime fixe seul (sans PDP)
  pct_prime_fixe_pdp:    number    // prime fixe + PDP combiné (compat)
  pct_pdp:               number    // dépassement puissance seul
  pct_cosphi:            number
  pct_redevance:         number
  pct_taxes:             number    // TVA + TCO (hors redevance)
  pct_surcouts:          number
  pct_residuel:          number    // MTTC non identifié par l'OCR

  // Montants absolus FCFA (pour labels du pie et diagnostics)
  montant_energie_calc:  number    // énergie (OCR ou tranches calculées)
  montant_pf_calc:       number    // prime fixe (OCR ou tarif × PS)
  montant_pdp_fcfa:      number
  montant_redevance_fcfa:number
  montant_taxes_fcfa:    number    // TVA + TCO
  montant_residuel_fcfa: number

  // Indicateurs de source des données
  energie_reconstructed: boolean   // true si calculé depuis tranches (pas OCR)
  pf_reconstructed:      boolean   // true si calculé depuis tarif × PS (pas OCR)

  // Optimisation
  choix_tarif_optimal:      MTCategory | null
  economie_ps_fcfa:         number   // strict : PS réduit à Pmax exactement
  economie_ps_prudent_fcfa: number   // prudent : PS réduit à Pmax × 1.1 (marge 10%)
  economie_cosphi_fcfa:     number
  economie_totale_fcfa:     number
  economie_annuelle_fcfa:   number
  nouveau_mttc_fcfa:        number

  // Indicateur qualité des données
  mt_tarif_indisponible?: boolean  // true si catégorie MT avec grille null
}

// ── Enregistrement DB ──
export interface AuditBillingParamsDB {
  id?:                    string
  audit_id:               string
  site_id:                string
  organization_id:        string
  numero_contrat?:        string
  domaine_tension:        'BT' | 'MT' | 'HT'
  categorie_tarifaire:    string
  grille_annee:           number
  puissance_souscrite_kw?: number
  puissance_transfo_kva?:  number
  comptage_position?:      string
  reference_invoice_id?:   string
  reference_senelec_id?:   string
  periode_reference_jours: number
  intervalle_mesure_min:   number
  source_mesure:           string
  has_transformateur:      boolean
  tco_applicable:          boolean
  tva_applicable:          boolean
}
