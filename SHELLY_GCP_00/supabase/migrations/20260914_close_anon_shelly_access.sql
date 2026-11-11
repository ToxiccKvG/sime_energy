-- ============================================================
--  Fermeture de l'accès anonyme aux données Shelly
--
--  Constat (2026-09-14) : la clé anon — publique par construction,
--  elle est dans le bundle JS du front — permettait de lire tout
--  l'historique des capteurs :
--    · shelly_cl et shelly_cl_horaire : policies `anon_read_*` en
--      `using (true)`, héritées des premiers essais ;
--    · shelly_cl_journalier : vue sans security_invoker, propriétaire
--      postgres, donc lue en contournant le RLS de shelly_cl ;
--    · fn_energy_* : SECURITY DEFINER et exécutables par anon.
--
--  Aucune route publique du front ne lit ces objets : toutes les
--  lectures Shelly sont sous <ProtectedRoute> (rôle authenticated).
--  Les Edge Functions et le cron utilisent service_role, qui
--  contourne le RLS et n'est pas cité ici.
-- ============================================================

-- ── Relevés bruts et horaires ───────────────────────────────
drop policy if exists anon_read_shelly_cl         on shelly_cl;
drop policy if exists anon_read_shelly_cl_horaire on shelly_cl_horaire;
revoke all on shelly_cl         from anon;
revoke all on shelly_cl_horaire from anon;

-- ── Vue journalière ─────────────────────────────────────────
-- security_invoker : la vue est désormais évaluée avec les droits de
-- l'appelant, donc soumise au RLS de shelly_cl comme un accès direct.
alter view shelly_cl_journalier set (security_invoker = true);
revoke all on shelly_cl_journalier from anon;

-- ── RPC énergie ─────────────────────────────────────────────
-- `public` est cité car fn_energy_by_device portait un grant implicite
-- (`=X`) qui rendait le revoke sur anon seul inopérant.
revoke execute on function
  fn_energy_by_day(timestamptz, timestamptz, text[], text[], text[]),
  fn_energy_by_device(timestamptz, timestamptz, text[], text[], text[]),
  fn_energy_profile(timestamptz, timestamptz, text[], text, text[]),
  fn_energy_repartition(timestamptz, timestamptz, text[], text[])
from anon, public;

-- ── Vérification ────────────────────────────────────────────
-- Attendu : aucune ligne ne mentionne anon.
--
-- select relname, relacl::text from pg_class
-- where relname in ('shelly_cl','shelly_cl_horaire','shelly_cl_journalier');
-- select proname, proacl::text from pg_proc where proname like 'fn_energy%';
-- select tablename, policyname from pg_policies where policyname like 'anon%';
