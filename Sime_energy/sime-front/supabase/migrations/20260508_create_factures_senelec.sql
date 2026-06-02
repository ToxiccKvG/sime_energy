-- Table for structured SENELEC billing data imported from Excel (63-column template)
CREATE TABLE IF NOT EXISTS public.factures_senelec (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  audit_id                  UUID REFERENCES public.audits(id) ON DELETE SET NULL,
  -- Identité contrat
  numero_compte_contrat     TEXT NOT NULL,
  partenaire                TEXT,
  localite                  TEXT,
  arrondissement            TEXT,
  rue                       TEXT,
  -- Facture
  numero_facture            BIGINT NOT NULL,
  date_comptable_facture    DATE,
  montant_total_energie     NUMERIC,
  montant_redevance         NUMERIC,
  montant_tco               NUMERIC,
  montant_hors_tva          NUMERIC,
  montant_tva               NUMERIC,
  montant_facture_ttc       NUMERIC,
  date_debut_periode        DATE,
  date_fin_periode          DATE,
  -- Index compteur
  ai_cg                     NUMERIC,
  ni_cg                     NUMERIC,
  ancien_index_k1           NUMERIC,
  ancien_index_k2           NUMERIC,
  nouvel_index_k1           NUMERIC,
  nouvel_index_k2           NUMERIC,
  -- Énergie K1/K2
  montant_energie_k1        NUMERIC,
  montant_energie_k2        NUMERIC,
  consommation_facturee     NUMERIC,
  rappel_et_majoration      NUMERIC,
  rappel_k1                 NUMERIC,
  rappel_k2                 NUMERIC,
  majoration_k1             NUMERIC,
  majoration_k2             NUMERIC,
  -- Puissance
  nb_jour_facturation       NUMERIC,
  puissance_souscrite       NUMERIC,
  puissance_max_relevee     NUMERIC,
  montant_prime_fixe        NUMERIC,
  montant_cosinus_phi       NUMERIC,
  valeur_cosinus_phi        NUMERIC,
  -- Tarif
  type_tarif_numero         TEXT,
  type_tarif_texte          TEXT,
  type_client_texte         TEXT,
  ccg                       TEXT,
  type_compte_contrat       TEXT,
  anc_cote                  NUMERIC,
  unite_releve              TEXT,
  -- Énergie réactive
  ancien_index_reactif      NUMERIC,
  nouvel_index_reactif      NUMERIC,
  majo_reactif              NUMERIC,
  ancien_index_h1           NUMERIC,
  nouvel_index_h1           NUMERIC,
  -- Site
  agence                    TEXT,
  numero_compteur           TEXT,
  appartenance              TEXT,
  -- Colonnes calculées
  puissance_souscrite_kw    NUMERIC,
  categorie_tarifaire       TEXT,
  cons_k1                   NUMERIC,
  cons_k2                   NUMERIC,
  cons_t                    NUMERIC,
  cons_wr                   NUMERIC,
  heure_h1                  NUMERIC,
  heure_h2                  NUMERIC,
  puissance_transfo         NUMERIC,
  puissance_max_kw          NUMERIC,
  penalites_depassement     NUMERIC,
  annee_facturation         INTEGER,
  mois_facturation          TEXT,
  -- Metadata
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (numero_compte_contrat, numero_facture)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_factures_senelec_org ON public.factures_senelec (organization_id);
CREATE INDEX IF NOT EXISTS idx_factures_senelec_audit ON public.factures_senelec (audit_id);
CREATE INDEX IF NOT EXISTS idx_factures_senelec_annee_mois ON public.factures_senelec (annee_facturation, mois_facturation);
CREATE INDEX IF NOT EXISTS idx_factures_senelec_appartenance ON public.factures_senelec (appartenance);

-- RLS
ALTER TABLE public.factures_senelec ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_senelec_select" ON public.factures_senelec
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "factures_senelec_insert" ON public.factures_senelec
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "factures_senelec_delete" ON public.factures_senelec
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );
