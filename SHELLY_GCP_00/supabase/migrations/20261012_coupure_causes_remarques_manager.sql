-- ============================================================
--  Coupures : nouvelles causes (remarques du manager, 12/10/2026)
--
--  1. Coupure programmée SUR LE SITE : certains sites coupent eux-mêmes
--     le courant à heures fixes (ex. Donsin). Interne : c'est le site
--     qui met hors tension, pas le réseau.
--  2. Perte d'Internet : les appareils se taisent alors que le courant
--     est là. Ce n'est donc PAS une coupure : origine « non_retenue »,
--     exclue de l'énergie non distribuée (comme la fausse coupure).
--     Interne (box, Wi-Fi du site) ou externe (opérateur).
--  3. Nettoyage : 17 indices « nan » écrits par detect_coupures.py
--     (None devenu NaN dans pandas), corrigé dans le script le même jour.
-- ============================================================

insert into coupure_causes (code, origine, libelle, ordre) values
  ('coupure_programmee_site', 'interne',     'Coupure programmée par le site (horaires fixes, ex. Donsin)', 85),
  ('internet_site',           'non_retenue', 'Perte d''Internet sur le site (box, Wi-Fi) : courant présent', 102),
  ('internet_operateur',      'non_retenue', 'Panne Internet de l''opérateur : courant présent',             104)
on conflict (code) do nothing;

update coupures set cause_indice = null where cause_indice = 'nan';
