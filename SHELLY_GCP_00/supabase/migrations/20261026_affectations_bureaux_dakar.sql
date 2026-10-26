-- ============================================================
--  Affectations des appareils du Bureau CER2E Dakar — 2026-10-26
--
--  Depuis le 19/10/2026 09:45 UTC, le logement « Bureau CER2E Dakar »
--  est collecté comme un site à part (sa propre ligne shelly_accounts).
--  7 de ses appareils avaient encore une affectation ouverte sur
--  « Académie CER2E » (périodes posées le 08/10, quand le bureau passait
--  par le compte Académie). fn_qualite classait donc toutes leurs
--  mesures depuis le 19/10 « hors période d'affectation » (quarantaine) :
--  courbe de charge et rapports de Dakar presque vides.
--
--  Correctif : on ferme chaque période Académie au 19/10 09:00 UTC (début de l'heure de la première mesure, les contrôles travaillent à l'heure) et on
--  ouvre la suite sur « Bureau CER2E Dakar », même libellé et même statut
--  (rien d'inventé : un libellé incertain reste incertain).
--  Aucune mesure n'est touchée. Retour arrière : supprimer les périodes
--  Dakar créées ici et remettre au = null sur les périodes Académie.
-- ============================================================

begin;

with fermees as (
  update shelly_device_periodes p
     set au = '2026-10-19 09:00:00+00', updated_at = now()
   where p.au is null
     and p.site = 'Académie CER2E'
     and p.du < '2026-10-19 09:00:00+00'
     and p.device_id in (
       select distinct device_id from shelly_cl
        where site = 'Bureau CER2E Dakar' and ts > '2026-10-19'
     )
  returning p.device_id, p.libelle, p.statut
)
insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes)
select device_id, '2026-10-19 09:00:00+00', null, 'Bureau CER2E Dakar', libelle, statut,
       'Suite de la période Académie CER2E : le bureau de Dakar est collecté comme site à part depuis le 19/10/2026.'
  from fermees;

commit;
