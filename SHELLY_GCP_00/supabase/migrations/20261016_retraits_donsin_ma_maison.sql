-- ============================================================
--  Donsin et Ma Maison : appareils muets déclarés déconnectés — 2026-10-16
--
--  Décision de Maurice (16/10) : les 6 appareils encore signalés
--  « Appareil muet » après la déclaration de l'Académie sont eux aussi
--  déconnectés volontairement :
--    Donsin    : Arrivée générale (muette depuis le 30/08), Shelly H&T,
--                The pill (depuis le 01/09)
--    Ma Maison : Clé station météo, Motion 2, Lampe Cuisine
--  Sélection par le moteur lui-même (fn_qualite, règle APPAREIL_MUET),
--  chacun à partir de sa dernière mesure. Données intactes ; seules les
--  alertes s'arrêtent. Rejouable.
-- ============================================================

insert into shelly_device_retraits (device_id, depuis, motif, note)
select q.device_id,
       (q.detail->>'derniere_mesure')::timestamptz + interval '1 hour',
       'deconnecte_volontairement',
       q.site || ' : déconnecté volontairement (décision de Maurice, 16/10/2026)'
from fn_qualite(date '2026-10-01', date '2026-10-15', 0, 23, array['Donsin', 'Ma Maison'], null) q
where q.regle = 'APPAREIL_MUET'
  and not exists (select 1 from shelly_device_retraits rt where rt.device_id = q.device_id and rt.jusqu_a is null);
