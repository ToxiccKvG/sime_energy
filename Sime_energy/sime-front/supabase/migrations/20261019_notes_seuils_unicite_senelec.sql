-- 2026-10-19 — Correctifs issus de la campagne de tests (test/RAPPORT.md, bugs 21 et unicité SENELEC)
-- Uniquement des ajouts de colonnes + remplacement d'une contrainte d'unicité. Aucune donnée supprimée.

-- Bug 21a : notes d'inventaire partagées (jusqu'ici dans le localStorage du navigateur)
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS inventory_notes TEXT;

-- Bug 21b : seuils d'anomalie des « 4 piliers » enregistrés avec les paramètres de facturation
ALTER TABLE public.audit_billing_params
  ADD COLUMN IF NOT EXISTS k2_seuil_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS ps_seuil_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS cosphi_seuil NUMERIC;

-- Une facture SENELEC est unique au sein d'une organisation, pas entre organisations :
-- l'ancienne contrainte globale faisait entrer en collision deux organisations important
-- le même contrat (même numéro de compte contrat + numéro de facture).
ALTER TABLE public.factures_senelec
  DROP CONSTRAINT IF EXISTS factures_senelec_numero_compte_contrat_numero_facture_key;
ALTER TABLE public.factures_senelec
  ADD CONSTRAINT factures_senelec_org_contrat_facture_key
  UNIQUE (organization_id, numero_compte_contrat, numero_facture);
