-- ============================================================
--  Fix sécurité : shelly_accounts.auth_key ne doit jamais
--  atteindre le navigateur. Jusqu'ici RLS = "authenticated"
--  (toute la plateforme, les 4 organisations) et le front faisait
--  select('*') → la clé Shelly Cloud en clair partait dans le
--  payload réseau + React state dès le chargement de la liste,
--  pas seulement à l'édition.
--
--  Fix : sécurité au niveau colonne (Postgres column-level GRANT,
--  RLS ne gère que les lignes). Le rôle `authenticated` perd le
--  SELECT sur auth_key ; une colonne générée `auth_key_last6`
--  fournit de quoi afficher un masque côté UI. Les tests de
--  connexion et l'édition passent désormais par l'Edge Function
--  test-shelly-account (service_role), qui seule lit auth_key.
-- ============================================================

alter table shelly_accounts
  add column if not exists auth_key_last6 text generated always as (right(auth_key, 6)) stored;

revoke select on shelly_accounts from authenticated;

grant select (
  id, site, label, server_url, actif,
  last_poll_at, last_poll_status, last_error_msg,
  created_at, updated_at, auth_key_last6
) on shelly_accounts to authenticated;

comment on column shelly_accounts.auth_key is 'Jamais exposée au rôle authenticated (column-level GRANT) — accessible uniquement via service_role (Edge Functions poll-shelly / test-shelly-account).';
