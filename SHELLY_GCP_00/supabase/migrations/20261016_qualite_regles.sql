-- ============================================================
--  Qualité des données — étape 1 : faits sur les appareils + règles
--  2026-10-16
--
--  Pourquoi : les règles de qualité étaient écrites en dur, recopiées
--  dans 8 fichiers front et dans le SQL, avec des seuils différents d'un
--  onglet à l'autre (2,5 σ ici, 3 σ là ; 0,05 ici, 0,01 là). L'audit du
--  16/10 a montré qu'elles détruisaient ou inventaient de l'énergie
--  (Nettoyage auto : 54,34 kWh → 1,33 kWh sur Ma Maison).
--
--  Cette migration ne calcule rien : elle pose les FAITS (familles,
--  alimentation) et les RÈGLES (seuils, portée, action) en base. Le
--  moteur fn_qualite (étape 2) les lira ; aucun écran ne les code plus.
--
--  Aucune mesure n'est modifiée.
-- ============================================================


-- ── 1. Qui peut modifier les règles ──────────────────────────
--  Le rôle d'organisation ne suffit pas : les 5 comptes CER2E sont tous
--  « admin ». Liste dédiée, décidée par Maurice le 16/10 : lui (deux
--  comptes), Kevin, Daouda. Gérée par migration uniquement.
create table if not exists iot_editeurs_regles (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  note      text,
  ajoute_le timestamptz not null default now()
);

insert into iot_editeurs_regles (user_id, note) values
  ('a51960f0-27be-4a41-b2a4-64a4011c0208', 'Maurice (m.diouf)'),
  ('c177d2ee-69d7-407e-a535-7d136ae19a3b', 'Maurice (second compte)'),
  ('fcbefe14-8a74-41b8-bcd4-27c34b3230cd', 'Kevin'),
  ('6711dcbe-9606-4b39-b4ac-d0c61395161a', 'Daouda')
on conflict (user_id) do nothing;

alter table iot_editeurs_regles enable row level security;
drop policy if exists iot_editeurs_regles_read on iot_editeurs_regles;
create policy iot_editeurs_regles_read on iot_editeurs_regles
  for select to authenticated using (true);
-- Pas de politique d'écriture : la liste se modifie par migration.

create or replace function est_editeur_regles()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from iot_editeurs_regles where user_id = auth.uid())
$$;
revoke all on function est_editeur_regles() from public;
grant execute on function est_editeur_regles() to authenticated;


-- ── 2. Familles d'appareils ──────────────────────────────────
--  Remplace les listes en dur (« CAPTEUR_ENV et ETAT ne mesurent pas
--  d'énergie », « les lampes émettent par intermittence »…).
create table if not exists shelly_familles (
  code              text primary key,
  libelle           text    not null,
  mesure_energie    boolean not null,
  mesure_env        boolean not null,
  nb_phases         int     check (nb_phases between 1 and 3),
  -- Faux : l'appareil se tait quand il est éteint (ampoule coupée à
  -- l'interrupteur, vérifié à Ma Maison : médiane 1 à 15 h/j). Ses
  -- heures manquantes ne disent rien de la collecte.
  emission_continue boolean not null,
  ordre             int     not null default 0,
  updated_at        timestamptz not null default now()
);

insert into shelly_familles (code, libelle, mesure_energie, mesure_env, nb_phases, emission_continue, ordre) values
  ('ENERGIE_3PH', 'Compteur triphasé (3EM, Pro 3EM)',      true,  false, 3,    true,  10),
  ('ENERGIE_2PH', 'Compteur biphasé (EM, Pro EM)',         true,  false, 2,    true,  20),
  ('ENERGIE_1PH', 'Prise ou module monophasé (Plug, PM)',  true,  false, 1,    true,  30),
  ('LUMIERE',     'Éclairage (ampoule, variateur)',        true,  false, 1,    false, 40),
  ('CAPTEUR_ENV', 'Capteur d''environnement (H&T, météo)', false, true,  null, true,  50),
  ('ETAT',        'Capteur d''état (porte, mouvement…)',   false, false, null, false, 60)
on conflict (code) do nothing;

-- Toutes les familles déclarées existent : la clé étrangère se pose sans reprise
alter table shelly_device_types
  drop constraint if exists shelly_device_types_famille_fk;
alter table shelly_device_types
  add constraint shelly_device_types_famille_fk
  foreign key (device_family) references shelly_familles (code);

alter table shelly_familles enable row level security;
drop policy if exists shelly_familles_read on shelly_familles;
create policy shelly_familles_read on shelly_familles
  for select to authenticated using (true);
drop policy if exists shelly_familles_write on shelly_familles;
create policy shelly_familles_write on shelly_familles
  for all to authenticated using (est_editeur_regles()) with check (est_editeur_regles());


-- ── 3. Alimentation de chaque type (pile / secteur) ──────────
--  Remplace le test « device_type commence par SB ou S3SN », qui ratait
--  4 capteurs à pile (SHWT-1, LOQED, SHMOS-02, SNSN-0031Z) et classait à
--  tort S3SN-0U53X « à pile ». C'est sur ce contraste pile/secteur que
--  repose la détection des coupures (méthode validée le 24/09).
--
--  Rempli d'après les DONNÉES (16/10, 60 jours de shelly_cl_horaire) :
--  pile = le type remonte un niveau de pile. « inconnue » = pas de donnée
--  pour trancher ; ces types sont exclus des deux côtés de la détection.
alter table shelly_device_types
  add column if not exists alimentation text not null default 'inconnue'
  check (alimentation in ('pile', 'secteur', 'inconnue'));

update shelly_device_types set alimentation = 'pile'
 where device_type in ('S3SN-0U12A', 'SBHT-003C', 'SBWS-90CM', 'SHWT-1',
                       'LOQED', 'SBBT-002C', 'SBDW-002C', 'SBMO-003Z', 'SHMOS-02', 'SNSN-0031Z');

update shelly_device_types set alimentation = 'secteur'
 where device_family in ('ENERGIE_1PH', 'ENERGIE_2PH', 'ENERGIE_3PH', 'LUMIERE')
    or device_type in ('SHGS-1', 'S3SW-001P8EU');

-- Restent « inconnue » : SHHT-1 et SHSM-01 (aucun appareil actif),
-- S3SN-0U53X (aucune pile remontée, à confirmer sur place).


-- ── 4. Règles de qualité ─────────────────────────────────────
--  Une ligne = une règle. Le moteur (étape 2) les lit ; l'écran
--  Paramètres → Qualité (étape 5) les modifie.
--  Actions :
--    signaler    — affiché, sans effet sur les calculs
--    quarantaine — exclu des calculs, toujours visible et justifié
--    doublon     — copie ignorée ; seule exclusion automatique
create table if not exists qualite_regles (
  code         text primary key,
  libelle      text    not null,
  explication  text    not null,                       -- affichée et reprise dans les rapports
  familles     text[],                                 -- NULL = toutes
  roles        text[],                                 -- NULL = tous
  sites        text[],                                 -- NULL = tous
  parametres   jsonb   not null default '{}'::jsonb,
  action       text    not null check (action in ('signaler', 'quarantaine', 'doublon')),
  actif        boolean not null default true,
  ordre        int     not null default 0,
  modifie_par  uuid    references auth.users (id) on delete set null,
  modifie_le   timestamptz not null default now()
);

insert into qualite_regles (code, libelle, explication, familles, roles, parametres, action, ordre) values
  ('DOUBLON_EXACT', 'Doublon exact',
   'Même appareil, même horodatage : la copie est ignorée.',
   null, null, '{}', 'doublon', 10),

  ('HORS_AFFECTATION', 'Hors période d''affectation',
   'Le capteur mesurait un autre appareil ou un autre site à cette date (shelly_device_periodes) : la mesure n''appartient pas à l''appareil analysé.',
   null, null, '{}', 'quarantaine', 20),

  ('FIGE', 'Valeur figée',
   'La collecte relit la dernière mesure quand le capteur ne transmet plus : même valeur répétée. Les cumuls (pluie) ne sont jamais concernés.',
   array['CAPTEUR_ENV'], null, '{"duree_min_minutes": 30, "exclure_cumuls": true}', 'quarantaine', 30),

  ('HORS_BORNES_ENV', 'Valeur physiquement impossible',
   'Température ou humidité hors des limites physiques : erreur de mesure.',
   array['CAPTEUR_ENV'], null, '{"temperature_c": [-10, 60], "humidite_pct": [0, 100]}', 'quarantaine', 40),

  ('TENSION_HORS_PLAGE', 'Tension hors plage',
   'Tension hors de la plage normale. Souvent un vrai événement réseau (23/09 : 120 V avant une coupure) : signalé, jamais écarté.',
   array['ENERGIE_1PH', 'ENERGIE_2PH', 'ENERGIE_3PH'], null, '{"tension_v": [180, 260]}', 'signaler', 50),

  ('COUPURE', 'Coupure d''électricité',
   'Appareils sur secteur muets pendant que les capteurs à pile émettent. La consommation était réellement nulle : la période reste comptée.',
   null, null, '{"duree_min_minutes": 5, "fusion_ecart_minutes": 5}', 'signaler', 60),

  ('PERTE_COLLECTE', 'Perte de collecte',
   'Appareil à émission continue muet en dehors de toute coupure : la mesure manque, elle n''est pas nulle.',
   null, null, '{"duree_min_minutes": 60}', 'signaler', 70),

  ('JOUR_INCOMPLET', 'Journée incomplète',
   'Moins de 95 % des heures attendues pour l''appareil de référence (arrivée, sinon appareils à émission continue). Une heure de coupure compte comme présente. Écartée des moyennes et extremums journaliers, conservée dans les totaux.',
   null, null, '{"part_min_heures": 0.95}', 'quarantaine', 80),

  ('REPRISE', 'Reprise après un trou',
   'Le compteur étant cumulatif, l''énergie d''un trou retombe sur l''heure de reprise : total juste, pic possible sur la courbe horaire.',
   null, null, '{}', 'signaler', 90),

  ('ABERRANT', 'Valeur inhabituelle',
   'Heure supérieure au double de ce que l''appareil atteint 99 % du temps. Inhabituel ne veut pas dire faux : à vérifier. (Testé sur Ma Maison, 90 j : 18 heures sur ~26 000.)',
   array['ENERGIE_1PH', 'ENERGIE_2PH', 'ENERGIE_3PH', 'LUMIERE'], null,
   '{"facteur_p99": 2, "min_wh": 20, "historique_jours": 90, "historique_min_jours": 14}', 'signaler', 100),

  ('NEGATIF', 'Énergie négative',
   'Énergie négative : souvent un TC monté à l''envers (à déclarer en sens inverse sur le rôle de l''appareil).',
   array['ENERGIE_1PH', 'ENERGIE_2PH', 'ENERGIE_3PH'], null, '{}', 'signaler', 110),

  ('DEPARTS_SUP_ARRIVEE', 'Départs supérieurs à l''arrivée',
   'La somme des départs dépasse l''arrivée de plus de 5 % sur la journée : TC inversé, départ rattaché au mauvais site ou rôle faux. (Ma Maison, 30 j : départs = 74 à 92 % de l''arrivée.)',
   null, array['M1_RESEAU', 'DEPART'], '{"tolerance_pct": 5}', 'signaler', 120),

  ('PHASES_TOTAL', 'Phases différentes du total',
   'Somme des phases différente du total du compteur, comparée sur les heures complètes seulement (sinon les coupures faussent l''écart). Le compteur fait foi.',
   array['ENERGIE_2PH', 'ENERGIE_3PH'], null, '{"tolerance_pct": 5, "min_mesures_heure": 55}', 'signaler', 130),

  ('ZERO_ARRIVEE', 'Arrivée à zéro',
   'Compteur d''arrivée à 0 pendant au moins une heure sans coupure détectée : capteur, TC ou absence à vérifier. Sur un départ, 0 veut simplement dire « éteint ».',
   null, array['M1_RESEAU'], '{"duree_min_minutes": 60}', 'signaler', 140)
on conflict (code) do nothing;

alter table qualite_regles enable row level security;
drop policy if exists qualite_regles_read on qualite_regles;
create policy qualite_regles_read on qualite_regles
  for select to authenticated using (true);
drop policy if exists qualite_regles_write on qualite_regles;
create policy qualite_regles_write on qualite_regles
  for all to authenticated using (est_editeur_regles()) with check (est_editeur_regles());


-- ── 5. Historique des règles ─────────────────────────────────
--  Un rapport doit pouvoir dire « analysé selon les règles en vigueur
--  le … » : chaque modification est conservée, avec son auteur.
create table if not exists qualite_regles_historique (
  id         bigserial primary key,
  code       text        not null,
  operation  text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  avant      jsonb,
  apres      jsonb,
  par        uuid,
  le         timestamptz not null default now()
);
create index if not exists qualite_regles_historique_code_idx on qualite_regles_historique (code, le desc);

alter table qualite_regles_historique enable row level security;
drop policy if exists qualite_regles_historique_read on qualite_regles_historique;
create policy qualite_regles_historique_read on qualite_regles_historique
  for select to authenticated using (true);
-- Pas de politique d'écriture : seul le déclencheur écrit.

create or replace function qualite_regles_horodater()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.modifie_le  := now();
  new.modifie_par := coalesce(auth.uid(), new.modifie_par);
  return new;
end
$$;

create or replace function qualite_regles_journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into qualite_regles_historique (code, operation, avant, apres, par)
  values (
    coalesce(new.code, old.code),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end
$$;

drop trigger if exists trg_qualite_regles_horodater on qualite_regles;
create trigger trg_qualite_regles_horodater
  before update on qualite_regles
  for each row execute function qualite_regles_horodater();

drop trigger if exists trg_qualite_regles_journaliser on qualite_regles;
create trigger trg_qualite_regles_journaliser
  after insert or update or delete on qualite_regles
  for each row execute function qualite_regles_journaliser();

-- Le jeu de départ entre dans l'historique : c'est la « version du 16/10 »
insert into qualite_regles_historique (code, operation, apres, par)
select code, 'INSERT', to_jsonb(r), null from qualite_regles r
where not exists (select 1 from qualite_regles_historique h where h.code = r.code);
