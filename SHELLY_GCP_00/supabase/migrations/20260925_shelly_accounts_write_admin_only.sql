-- ============================================================
--  Fix sécurité : séparer la LECTURE de l'ÉCRITURE sur shelly_accounts.
--
--  Constat (2026-09-25) : la politique d'origine est
--      FOR ALL USING (auth.role() = 'authenticated')
--  (create_shelly_accounts.sql:33). La migration 20260720 a bien fermé
--  la LECTURE de auth_key au niveau colonne, mais un GRANT colonne ne
--  couvre pas l'écriture : n'importe quel compte connecté — simple
--  membre, invité — pouvait encore
--    • basculer `actif` à false           → arrêt silencieux de la collecte ;
--    • réécrire `server_url`              → détournement du polling ;
--    • écraser `auth_key`                 → perte de l'accès Shelly Cloud ;
--    • DELETE la ligne du compte          → perte de la configuration.
--
--  Fix : la lecture reste ouverte aux utilisateurs connectés (le tableau
--  de bord IOT et l'onglet Paramètres en dépendent, et auth_key leur est
--  déjà invisible), l'écriture est réservée aux administrateurs
--  d'organisation via le helper public.user_admin_org_ids() introduit par
--  20260915_security_audit_app_tables.sql.
--
--  Portée : shelly_accounts ne porte pas encore de organization_id, donc
--  « administrateur » signifie ici « admin d'au moins une organisation »,
--  pas « admin de l'organisation propriétaire du compte ». Le cloisonnement
--  par organisation reste à faire (chantier isolation multi-tenant).
--
--  service_role n'est pas concerné : les Edge Functions poll-shelly et
--  test-shelly-account contournent RLS et continuent d'écrire
--  last_poll_at / last_poll_status / last_error_msg normalement.
-- ============================================================

alter table public.shelly_accounts enable row level security;

drop policy if exists "shelly_accounts_authenticated_rw" on public.shelly_accounts;

-- ── Lecture : tout utilisateur connecté ──────────────────────
-- auth_key reste exclue par le GRANT colonne de 20260720 ; seule
-- auth_key_last6 (colonne générée) est lisible.
drop policy if exists "shelly_accounts_read" on public.shelly_accounts;
create policy "shelly_accounts_read" on public.shelly_accounts
  for select to authenticated
  using (true);

-- ── Écriture : administrateurs d'organisation uniquement ─────
drop policy if exists "shelly_accounts_admin_insert" on public.shelly_accounts;
create policy "shelly_accounts_admin_insert" on public.shelly_accounts
  for insert to authenticated
  with check (exists (select 1 from public.user_admin_org_ids()));

drop policy if exists "shelly_accounts_admin_update" on public.shelly_accounts;
create policy "shelly_accounts_admin_update" on public.shelly_accounts
  for update to authenticated
  using      (exists (select 1 from public.user_admin_org_ids()))
  with check (exists (select 1 from public.user_admin_org_ids()));

drop policy if exists "shelly_accounts_admin_delete" on public.shelly_accounts;
create policy "shelly_accounts_admin_delete" on public.shelly_accounts
  for delete to authenticated
  using (exists (select 1 from public.user_admin_org_ids()));

comment on table public.shelly_accounts is
  'Comptes Shelly Cloud. Lecture : authenticated (auth_key masquée par GRANT colonne, cf. 20260720). Écriture : admins d''organisation uniquement (cf. 20260925). Écriture technique du collecteur : service_role, hors RLS.';
