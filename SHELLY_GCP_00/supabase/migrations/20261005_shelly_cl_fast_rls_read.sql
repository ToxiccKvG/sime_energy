-- ============================================================
--  Lecture de shelly_cl / shelly_cl_horaire : règle RLS « rapide »
--
--  Symptôme : IOT > « Charger depuis Supabase » (granularité Minute, un mois
--  de la station météo Donsin) échouait avec « Erreur inconnue ».
--  Cause   : la politique `using (auth.role() = 'authenticated')` est évaluée
--  LIGNE PAR LIGNE. Postgres ne peut pas estimer sa sélectivité (94 lignes
--  estimées pour 43 182 réelles) et choisit « bitmap scan + tri » : il lit tout
--  le mois (34 000 blocs) avant de rendre la première page. Mesuré avec un
--  rôle authenticated : 10,7 s pour une page de 1 000 lignes, alors que
--  `authenticated` est limité à statement_timeout = 8 s -> erreur 57014.
--
--  Correctif : même autorisation, écrite sans test par ligne. La politique ne
--  s'applique qu'au rôle `authenticated` (using true) : un anonyme n'a toujours
--  AUCUN accès (pas de politique pour lui, et ses droits de table sont fermés
--  depuis 20260914). Mesuré : même requête en 39 ms, plan « Index Scan ».
-- ============================================================

drop policy if exists shelly_cl_authenticated_read on shelly_cl;
create policy shelly_cl_authenticated_read on shelly_cl
  for select to authenticated using (true);

drop policy if exists shelly_cl_horaire_authenticated_read on shelly_cl_horaire;
create policy shelly_cl_horaire_authenticated_read on shelly_cl_horaire
  for select to authenticated using (true);
