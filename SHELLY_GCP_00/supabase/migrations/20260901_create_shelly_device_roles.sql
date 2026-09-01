-- ============================================================
--  Rattachement appareil → rôle dans l'architecture électrique
--
--  Chaînon manquant du module IOT : `device_family` dit quel MATÉRIEL
--  est branché (ENERGIE_3PH, CAPTEUR_ENV…), jamais CE QU'IL MESURE.
--  Sans cette information :
--   - le sélecteur « Profil d'analyse (Mi) » de l'onglet Analyse ne
--     pouvait rien filtrer (il a été retiré le 2026-09-01) ;
--   - aucun bilan n'est calculable (autoconsommation = M3 − M5,
--     taux de couverture PV, part groupe électrogène).
--
--  Clé = `device_id` et NON le nom : les noms changent côté Shelly
--  Cloud (ex. `441d6475d44c`, renommé et déplacé de site), et les
--  conventions diffèrent d'un site à l'autre — Académie CER2E nomme
--  ses compteurs `M1_SENELEC`/`M2_…`/`PV_…`, Donsin « Arrivée
--  générale », Ma Maison « EM-SENELEC ». Un rattachement par nom
--  casserait au premier renommage.
--
--  Pas de clé étrangère possible : `shelly_cl` a N lignes par
--  appareil et `shelly_devices_catalog` est une vue matérialisée.
--  L'intégrité est donc applicative — un device_id orphelin est
--  inoffensif (il ne matche simplement aucun appareil).
-- ============================================================

create table if not exists shelly_device_roles (
  device_id   text        primary key,
  role        text        not null check (role in (
                            'M1_SENELEC',   -- arrivée réseau (SENELEC)
                            'M2_SELECTEUR', -- sélecteur / inverseur PV-réseau
                            'M3_CHARGE',    -- charge totale du site
                            'M4_GROUPE',    -- groupe électrogène
                            'M5_PV',        -- production photovoltaïque
                            'BESS',         -- batterie de stockage
                            'DEPART',       -- départ / sous-charge (prise, circuit, équipement)
                            'AMBIANCE',     -- capteur d'ambiance (température, humidité…)
                            'AUTRE'
                          )),
  libelle     text,       -- intitulé métier libre, ex. « Arrivée générale bâtiment B »

  -- Sens de comptage du TC. Sur PV_BUILDING COMMUNAL (Académie CER2E),
  -- la production est comptée en soutirage : 380 825 Wh en wh_tot contre
  -- 428 Wh en wh_rtot sur 7 jours. Sans ce drapeau, un rôle M5_PV donne
  -- une production nulle et une consommation fantôme.
  sens_inverse boolean    not null default false,

  -- Provenance : 'auto' = proposé par le système à partir du nom ou du
  -- comportement, 'manuel' = saisi par un utilisateur. Une ligne dont
  -- `confirme_at` est NULL est une PROPOSITION, pas une vérité : l'écran
  -- de rattachement doit la présenter comme « à confirmer ». On ne devine
  -- jamais en silence.
  origine     text        not null default 'manuel' check (origine in ('auto','manuel')),
  confirme_at timestamptz,
  confirme_par uuid       references auth.users (id) on delete set null,

  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shelly_device_roles_role_idx on shelly_device_roles (role);
-- Les propositions non confirmées sont la file de travail de l'écran de
-- rattachement : index partiel pour la lister sans scanner la table.
create index if not exists shelly_device_roles_a_confirmer_idx
  on shelly_device_roles (role) where confirme_at is null;

comment on table shelly_device_roles is
  'Rattachement device_id → rôle dans l''architecture électrique du site. Complète shelly_device_types (quel matériel) en disant ce que l''appareil mesure. Une ligne sans confirme_at est une proposition à valider, pas un rattachement acquis.';
comment on column shelly_device_roles.sens_inverse is
  'true = les compteurs wh_tot/wh_rtot du TC sont inversés par rapport au rôle (production comptée en soutirage). Constaté sur PV_BUILDING COMMUNAL.';

-- ── Trigger updated_at (même pattern que shelly_accounts / _types) ──────
create or replace function update_shelly_device_roles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shelly_device_roles_updated_at on shelly_device_roles;
create trigger trg_shelly_device_roles_updated_at
  before update on shelly_device_roles
  for each row execute function update_shelly_device_roles_updated_at();

-- ── RLS : même politique que shelly_device_types / shelly_accounts ─────
alter table shelly_device_roles enable row level security;

drop policy if exists "shelly_device_roles_authenticated_rw" on shelly_device_roles;
create policy "shelly_device_roles_authenticated_rw" on shelly_device_roles
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── Propositions initiales (origine='auto', NON confirmées) ────────────
--
--  Uniquement les cas où le nom énonce le rôle sans ambiguïté : les
--  compteurs préfixés M1..M5 / PV de l'Académie CER2E. Donsin et Ma
--  Maison ne suivent pas cette convention et ne sont volontairement PAS
--  devinés ici — ils passeront par l'écran de rattachement.
--
--  `confirme_at` reste NULL : rien n'est acquis tant qu'un humain n'a pas
--  validé, y compris ces lignes-ci.
insert into shelly_device_roles (device_id, role, libelle, origine)
select
  c.device_id,
  case
    when c.name ~ '^M1[_ ]' then 'M1_SENELEC'
    when c.name ~ '^M2[_ ]' then 'M2_SELECTEUR'
    when c.name ~ '^M3[_ ]' then 'M3_CHARGE'
    when c.name ~ '^M4[_ ]' then 'M4_GROUPE'
    when c.name ~ '^(M5|PV)[_ ]' then 'M5_PV'
  end,
  c.name,
  'auto'
from shelly_devices_catalog c
where c.device_family like 'ENERGIE%'
  and c.name ~ '^(M[1-5]|PV)[_ ]'
on conflict (device_id) do nothing;
