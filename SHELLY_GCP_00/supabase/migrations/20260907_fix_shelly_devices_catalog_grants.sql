-- ============================================================
--  Catalogue des appareils — correction des privilèges
--
--  Problème : toute lecture de shelly_devices_catalog avec la clé
--  service_role échoue en `42501 permission denied for materialized
--  view shelly_devices_catalog`. Le front (rôle `authenticated`) et le
--  job cron de rafraîchissement (rôle propriétaire) ne sont pas touchés ;
--  seuls les scripts serveur le sont.
--
--  Cause : les migrations 20260827 et 20260831 posent
--    revoke all on shelly_devices_catalog from anon, authenticated;
--    grant select on shelly_devices_catalog to authenticated;
--  en partant du principe que Supabase accorde par défaut ALL à anon et
--  authenticated. C'est vrai pour les tables et les vues ordinaires, pas
--  pour les vues matérialisées : `ALTER DEFAULT PRIVILEGES ... ON TABLES`
--  ne s'applique pas aux matviews. À la création, une matview ne porte
--  donc aucun privilège hors propriétaire — le `revoke` ne retirait rien,
--  et `service_role`, jamais cité, n'a jamais rien reçu.
--
--  L'intention de sécurité d'origine (ne pas exposer les noms d'appareils
--  et de sites à un visiteur non authentifié, alors que shelly_cl exige
--  `authenticated`) reste satisfaite : on n'accorde rien à `anon`.
-- ============================================================

grant select on shelly_devices_catalog to service_role;

-- Idempotent et sans effet si déjà en place : on réaffirme la cible
-- nominale, pour que ce fichier documente à lui seul l'état attendu.
grant select on shelly_devices_catalog to authenticated;
revoke all on shelly_devices_catalog from anon;

-- ── Vérification ────────────────────────────────────────────
-- Attendu : authenticated=SELECT, service_role=SELECT, anon absent.
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name = 'shelly_devices_catalog'
-- union all
-- select unnest(array['-- relacl --']), unnest(relacl::text[])
-- from pg_class where relname = 'shelly_devices_catalog';
--
-- NB : information_schema.role_table_grants n'affiche pas les matviews.
-- Le second bloc (pg_class.relacl) est celui qui fait foi.

-- ⚠ Toute recréation future de la vue (drop + create, comme en 20260831)
--   remet les privilèges à zéro : il faut alors rejouer ces grants.
