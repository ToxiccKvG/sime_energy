-- ============================================================
--  shelly_cl_journalier : droits du lecteur — 2026-10-15
-- ============================================================
--  La vue appartient à postgres et s'exécutait avec ses droits
--  (lint Supabase « Security Definer View ») : elle ignorait la RLS
--  de shelly_cl. Restreindre shelly_cl plus tard l'aurait laissée
--  ouverte. Elle applique désormais les droits et la RLS du lecteur,
--  comme shelly_pluie_* et coupures_par_cause.
--
--  Les droits d'écriture donnés par défaut à authenticated sont
--  retirés (vue d'agrégat, jamais modifiable de toute façon).
--  Retour arrière : alter view ... set (security_invoker = false);
-- ============================================================

alter view public.shelly_cl_journalier set (security_invoker = true);

revoke insert, update, delete on public.shelly_cl_journalier from authenticated;
