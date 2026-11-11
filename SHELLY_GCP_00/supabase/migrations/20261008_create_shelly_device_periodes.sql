-- ============================================================
--  Périodes d'affectation des capteurs Shelly
--
--  Pourquoi : un même device_id a parfois mesuré des appareils différents,
--  sur des sites différents (prises de la mission « Prestation CER2E » du
--  18 au 27/05 réinstallées ensuite à l'Académie ou à Ma Maison, compteur
--  « Compteur 2 » de l'Académie devenu « Arrivée générale » à Donsin…).
--  shelly_device_roles ne porte qu'un libellé, sans dates : sans cette
--  table, l'historique d'un appareil mélange plusieurs appareils réels.
--
--  Une ligne = « de du à au, ce capteur mesurait tel appareil sur tel site ».
--  au NULL = affectation en cours. On ne remplit QUE les capteurs qui ont
--  changé d'appareil ; un simple renommage n'a pas besoin de ligne.
--  shelly_cl n'est jamais modifiée.
--
--  statut 'incertain' : du 26/05 au 17/06/2026 deux collectes écrivaient en
--  parallèle sur certains capteurs avec deux noms différents (même mesure,
--  même compteur) ; l'appareil réellement mesuré n'est pas connu (réponse
--  de Maurice le 08/10/2026). On le dit plutôt que d'inventer.
-- ============================================================

create table if not exists shelly_device_periodes (
  id         uuid        primary key default gen_random_uuid(),
  device_id  text        not null,
  du         timestamptz not null,
  au         timestamptz,                         -- exclusif ; NULL = en cours
  site       text        not null,                -- même valeur que shelly_cl.site
  libelle    text        not null,                -- ce que le capteur mesurait
  statut     text        not null default 'confirme' check (statut in ('confirme', 'incertain')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (au is null or au > du)
);

create index if not exists shelly_device_periodes_device_idx on shelly_device_periodes (device_id, du);

-- Pas deux périodes qui se chevauchent pour un même capteur.
create extension if not exists btree_gist;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shelly_device_periodes_sans_chevauchement') then
    alter table shelly_device_periodes
      add constraint shelly_device_periodes_sans_chevauchement
      exclude using gist (device_id with =, tstzrange(du, au, '[)') with &&);
  end if;
end $$;

-- ── RLS : lecture pour tout connecté, écriture admins (comme shelly_accounts) ──
alter table shelly_device_periodes enable row level security;

drop policy if exists "shelly_device_periodes_read" on shelly_device_periodes;
create policy "shelly_device_periodes_read" on shelly_device_periodes
  for select to authenticated using (true);

drop policy if exists "shelly_device_periodes_admin_insert" on shelly_device_periodes;
create policy "shelly_device_periodes_admin_insert" on shelly_device_periodes
  for insert to authenticated
  with check (exists (select 1 from public.user_admin_org_ids()));

drop policy if exists "shelly_device_periodes_admin_update" on shelly_device_periodes;
create policy "shelly_device_periodes_admin_update" on shelly_device_periodes
  for update to authenticated
  using      (exists (select 1 from public.user_admin_org_ids()))
  with check (exists (select 1 from public.user_admin_org_ids()));

drop policy if exists "shelly_device_periodes_admin_delete" on shelly_device_periodes;
create policy "shelly_device_periodes_admin_delete" on shelly_device_periodes
  for delete to authenticated
  using (exists (select 1 from public.user_admin_org_ids()));

revoke all on shelly_device_periodes from anon;

comment on table shelly_device_periodes is
  'Périodes d''affectation des capteurs (device_id → appareil réel, site, du/au). Seuls les capteurs déplacés y figurent. Lecture : authenticated ; écriture : admins (cf. 20261008).';

-- ── Remplissage initial (bornes à l'heure, lues dans shelly_cl_horaire le 08/10/2026) ──
insert into shelly_device_periodes (device_id, du, au, site, libelle, statut, notes)
select * from (values
  -- Mission « Prestation CER2E » puis réemploi
  ('d48afc76f468',   '2026-05-18 13:00+00'::timestamptz, '2026-05-27 09:00+00'::timestamptz, 'Prestation CER2E', 'Machine à laver',          'confirme', null),
  ('d48afc76f468',   '2026-09-27 15:00+00', null,                     'Ma Maison',        'Ventilo salon',            'confirme', null),

  ('48e72967a67c',   '2026-05-18 13:00+00', '2026-05-27 09:00+00',    'Prestation CER2E', 'Chauffe-eau 1',            'confirme', null),
  ('48e72967a67c',   '2026-05-29 11:00+00', null,                     'Académie CER2E',   'Bakary (prise)',           'confirme', null),

  ('48e72967a67c_1', '2026-05-18 13:00+00', '2026-05-21 17:00+00',    'Prestation CER2E', 'Chauffe-eau 1 (canal 2)',  'confirme', null),
  ('48e72967a67c_1', '2026-05-21 17:00+00', '2026-05-26 08:00+00',    'Prestation CER2E', 'Chambre 1',                'confirme', null),
  ('48e72967a67c_1', '2026-05-26 08:00+00', '2026-05-27 09:00+00',    'Prestation CER2E', 'Samba',                    'confirme', null),
  ('48e72967a67c_1', '2026-05-29 11:00+00', null,                     'Académie CER2E',   'Samba',                    'confirme', null),

  ('c45bbee17da2',   '2026-05-18 13:00+00', '2026-05-21 16:00+00',    'Prestation CER2E', 'Éclairage salon',          'confirme', null),
  ('c45bbee17da2',   '2026-05-21 16:00+00', '2026-05-27 09:00+00',    'Prestation CER2E', 'Général SENELEC',          'confirme', null),
  ('c45bbee17da2',   '2026-05-29 11:00+00', null,                     'Académie CER2E',   'Général SENELEC',          'confirme', null),

  ('c45bbee17da2_1', '2026-05-18 13:00+00', '2026-05-21 16:00+00',    'Prestation CER2E', 'Four & micro-onde',        'confirme', null),
  ('c45bbee17da2_1', '2026-05-21 16:00+00', '2026-05-26 08:00+00',    'Prestation CER2E', 'Chambre 2',                'confirme', null),
  ('c45bbee17da2_1', '2026-05-26 08:00+00', '2026-05-27 09:00+00',    'Prestation CER2E', 'Yacouba',                  'confirme', null),
  ('c45bbee17da2_1', '2026-05-29 11:00+00', null,                     'Académie CER2E',   'Yacouba',                  'confirme', null),

  ('08f9e0febc60',   '2026-05-18 13:00+00', '2026-05-27 09:00+00',    'Prestation CER2E', 'Porte garage',             'confirme', null),
  ('08f9e0febc60',   '2026-09-25 08:00+00', null,                     'Académie CER2E',   'Shelly Plug',              'confirme', null),

  -- Compteur déplacé d'un site à l'autre
  ('441d6475d44c',   '2026-04-24 12:00+00', '2026-05-18 15:00+00',    'Académie CER2E',   'Compteur 2',               'confirme', null),
  ('441d6475d44c',   '2026-08-10 14:00+00', null,                     'Donsin',           'Arrivée générale',         'confirme', null),

  -- Prises de Donsin déplacées vers les PC KHEOPS
  ('0892724e2c28',   '2026-07-06 13:00+00', '2026-07-10 15:00+00',    'Donsin',           'Prise bureau BC',          'incertain', 'Installation à Donsin (06→10/07, en partie enregistrée sous Académie avant la migration du compte le 09/07).'),
  ('0892724e2c28',   '2026-07-10 15:00+00', null,                     'Donsin',           'PC1 KHEOPS (fond de bureau)', 'confirme', null),
  ('9070694642a8',   '2026-07-10 11:00+00', '2026-07-23 16:00+00',    'Donsin',           'PC2 TBEA',                 'incertain', 'Nommée « PC2 CHAUFFE EAU » les 3 premières heures.'),
  ('9070694642a8',   '2026-07-23 16:00+00', null,                     'Donsin',           'PC2 KHEOPS (entrée)',      'confirme', null),

  -- Double collecte du 26/05 au 17/06 : appareil réel inconnu
  ('206ef102b9c4_1', '2026-04-16 11:00+00', '2026-05-26 15:00+00',    'Académie CER2E',   'Télé',                     'confirme', null),
  ('206ef102b9c4_1', '2026-05-26 15:00+00', null,                     'Académie CER2E',   'Télé ou ventilateur bureau', 'incertain', 'Deux collectes écrivaient la même mesure sous deux noms (26/05→17/06) ; seule l''ancienne a continué ensuite.'),
  ('206ef102b9c4_2', '2026-04-16 11:00+00', '2026-05-15 14:00+00',    'Académie CER2E',   'Woyofal',                  'confirme', null),
  ('206ef102b9c4_2', '2026-05-15 14:00+00', null,                     'Académie CER2E',   'Woyofal, projecteur vidéo ou Home Assistant', 'incertain', 'Noms en alternance du 15/05 au 17/06 (deux collectes) ; seule l''ancienne a continué ensuite.'),
  ('543204ba4b18',   '2026-04-20 10:00+00', '2026-05-26 15:00+00',    'Académie CER2E',   'Ventilateur',              'confirme', null),
  ('543204ba4b18',   '2026-05-26 15:00+00', null,                     'Académie CER2E',   'Ventilateur ou prise bureau', 'incertain', 'Deux collectes écrivaient la même mesure sous deux noms (26/05→17/06) ; seule l''ancienne a continué ensuite.')
) as v(device_id, du, au, site, libelle, statut, notes)
where not exists (select 1 from shelly_device_periodes);
