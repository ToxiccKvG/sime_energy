-- ─────────────────────────────────────────────────────────────────────────────
-- Contexte projet en JSON (snapshot) + réglages partagés par organisation
--
-- audits.project_context    : JSON complet d'un projet (infos générales, personnel,
--                             calendrier, réglages météo/BTU, sites/bâti, facturation).
--                             Généré par le front (src/services/project-context-builder.ts).
--                             Doc : sime-front/docs/project-context-json.md
-- organizations.settings    : réglages communs à l'organisation (météo, coefs BTU),
--                             auparavant stockés par utilisateur dans user_metadata.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS project_context    JSONB,
  ADD COLUMN IF NOT EXISTS project_context_at TIMESTAMPTZ;

COMMENT ON COLUMN public.organizations.settings IS
  'Réglages partagés par l''organisation : { version, meteo: MeteoSettings (location, monthly_temps, t_ref_*, coef_c, coef_g), updated_at, updated_by }.';
COMMENT ON COLUMN public.audits.project_context IS
  'Snapshot JSON complet du projet (schema_version 1). Lecture seule pour les consommateurs ; régénéré par l''app. Voir sime-front/docs/project-context-json.md.';
COMMENT ON COLUMN public.audits.project_context_at IS
  'Date de dernière génération de project_context.';

-- Reprise des réglages météo existants (user_metadata) vers l'organisation :
-- pour chaque organisation sans réglages, on prend ceux d'un membre (admin en priorité).
UPDATE public.organizations o
SET settings = jsonb_build_object(
  'version', 1,
  'meteo', src.meteo,
  'updated_at', now(),
  'updated_by', src.user_id,
  'migrated_from', 'user_metadata'
)
FROM (
  SELECT DISTINCT ON (ou.organization_id)
    ou.organization_id,
    u.id AS user_id,
    u.raw_user_meta_data -> 'energy_settings' -> 'meteo_settings' AS meteo
  FROM public.organization_users ou
  JOIN auth.users u ON u.id = ou.user_id
  WHERE u.raw_user_meta_data -> 'energy_settings' -> 'meteo_settings' IS NOT NULL
  ORDER BY ou.organization_id, (ou.role = 'admin') DESC
) src
WHERE o.id = src.organization_id
  AND o.settings = '{}'::jsonb;
