-- ============================================================
--  Retraits clos : bureaux Dakar / Thiès + Ancien bâtiment Mosquée — 2026-11-03
--
--  20 appareils portaient un retrait « déconnecté volontairement » encore
--  ouvert alors qu'ils transmettent chaque jour (décision de Maurice, 03/11) :
--
--  1. Bureau CER2E Dakar (9) et Bureau CER2E Thiès (10) : retraits posés le
--     16/10 pour juin-juillet, quand ces appareils passaient par le compte
--     Académie. Collectés via leurs propres clés depuis le 19/10 vers 09:00
--     UTC → clos au 19/10 09:00. Constaté le 26/10, reporté sur demande.
--  2. 483fdac3b59d (Mosquée, Ancien bâtiment : salle prière femme + WC +
--     poste gardien) : ex compteur de l'Académie retiré le 01/08, premier
--     relevé à la Mosquée le 28/10 15:10 UTC → clos à cette date.
--
--  Seuls les retraits encore ouverts (jusqu_a null) sont touchés.
--  Aucune mesure n'est touchée.
-- ============================================================

begin;

update shelly_device_retraits
   set jusqu_a = '2026-10-19 09:00:00+00',
       note = coalesce(note || ' — ', '') || 'Clos le 03/11/2026 : collecté via la clé du bureau depuis le 19/10.'
 where jusqu_a is null
   and device_id in (
     -- Bureau CER2E Dakar
     '206ef102b9c4', '206ef102b9c4_1', '206ef102b9c4_2', '206ef102b9c4_3',
     'XB61819871591476', 'XB137192906331245', 'ecda3bc4efb4', '8cbfea9705f4', '543204ba4b18',
     -- Bureau CER2E Thiès
     'ec6260821468', 'XB61819873983943', 'ccba97ee6e80', '34b7dac7cc10', '34b7da92210c',
     '34945479cc21', '54320452d75c', 'XB66172384006882', '5432045b3768', '0892724e2e88'
   );

update shelly_device_retraits
   set jusqu_a = '2026-10-28 15:10:00+00',
       note = coalesce(note || ' — ', '') || 'Clos le 03/11/2026 : réinstallé à la Mosquée Sacré Cœur (Ancien bâtiment), premier relevé le 28/10 15:10.'
 where jusqu_a is null and device_id = '483fdac3b59d';

commit;
