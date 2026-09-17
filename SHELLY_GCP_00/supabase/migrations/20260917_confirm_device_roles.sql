-- ============================================================
--  Confirmation des rôles (décision 4 du plan de travail) — 2026-09-17
--
--  L'utilisateur (m.diouf@cer2e.com) a répondu aux questions de câblage
--  puis validé l'ensemble des 75 propositions du 17/09 : elles passent
--  de « proposition » à « rattachement confirmé ». Les 8 rôles déjà
--  confirmés ne sont pas touchés.
--
--  Précision donnée au passage : EPT Thiès N'A PLUS DE DISPOSITIF.
--  Le Pro 3EM `TGBT_EPT Thiès` a été retiré (dernières données le
--  2026-08-22) ; il reste dans le compte Shelly, donc dans le catalogue,
--  mais ne mesure plus rien. Rôle AUTRE conservé, note mise à jour.
-- ============================================================

update shelly_device_roles set
  libelle = 'TGBT bâtiment EPT — dispositif retiré (données jusqu''au 22/08/2026)',
  notes   = 'Câblage 2026-09-17 : EPT Thiès n''a plus de dispositif — ce Pro 3EM a été retiré, dernières mesures le 2026-08-22. Historique : arrivée SENELEC propre, sans PV, bâtiment indépendant du building communal (dépassait M3 sur 313 h, jours ouvrés 9h–15h). Rôle AUTRE = hors bilan M1–M5.'
where device_id = '08f9e0e82db0';

update shelly_device_roles set
  confirme_at  = now(),
  confirme_par = 'a51960f0-27be-4a41-b2a4-64a4011c0208'
where confirme_at is null;
