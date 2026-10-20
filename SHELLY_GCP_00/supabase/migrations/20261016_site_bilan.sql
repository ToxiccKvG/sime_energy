-- ============================================================
--  site_bilan : comment obtenir la consommation de chaque site — 2026-10-16
--
--  Pourquoi : la Courbe de charge additionnait tous les appareils sans
--  tenir compte de leur rôle. À l'Académie, la production PV (M5, sens
--  inverse) finissait en « énergie retournée » : 406 kWh, « 11 505 % du
--  brut ». Une formule unique serait fausse, les sites étant câblés
--  différemment (réponses de Maurice du 17/09) :
--    Ma Maison : l'arrivée alimente tout, sans PV ni groupe → arrivée
--    Donsin    : PV EN AVAL de l'arrivée, non mesuré → indéterminée
--                (l'arrivée ne voit que le complément SONABEL)
--    Académie  : 3 arrivées distinctes, PV en amont du sélecteur ; la
--                charge du building est M3 → charge_M3, jamais de bilan
--                entre arrivées
--  Ces faits ne se devinent pas à partir des rôles : ils sont déclarés ici.
--
--  Méthodes :
--    arrivee      consommation = soutirage de l'arrivée (M1_RESEAU)
--    charge_M3    consommation = compteur de charge (M3_CHARGE)
--    departs      consommation = somme des départs (partielle par nature)
--    indeterminee pas de consommation calculable : on affiche les flux
--                 mesurés (réseau, PV, groupe, départs), jamais un faux total
-- ============================================================

create table if not exists site_bilan (
  site        text primary key,                 -- même valeur que shelly_cl.site
  methode     text not null check (methode in ('arrivee', 'charge_M3', 'departs', 'indeterminee')),
  explication text not null,
  modifie_par uuid references auth.users (id) on delete set null default auth.uid(),
  modifie_le  timestamptz not null default now()
);

insert into site_bilan (site, methode, explication) values
  ('Ma Maison', 'arrivee',
   'L''arrivée (EM-SENELEC) alimente toute la maison, sans PV ni groupe : elle mesure la consommation.'),
  ('Donsin', 'indeterminee',
   'Le PV est en aval de l''arrivée générale et n''est pas mesuré : l''arrivée ne voit que le complément SONABEL. Consommation réelle non mesurable.'),
  ('Académie CER2E', 'charge_M3',
   'Trois arrivées distinctes (building communal, TGBT_EPT retiré, bureau Woyofal) ; PV en amont du sélecteur. La consommation du building est celle du compteur de charge M3 ; pas de bilan entre arrivées.')
on conflict (site) do nothing;

alter table site_bilan enable row level security;
drop policy if exists site_bilan_read on site_bilan;
create policy site_bilan_read on site_bilan
  for select to authenticated using (true);
drop policy if exists site_bilan_write on site_bilan;
create policy site_bilan_write on site_bilan
  for all to authenticated using (est_editeur_regles()) with check (est_editeur_regles());
