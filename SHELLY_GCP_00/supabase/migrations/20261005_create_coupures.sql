-- ============================================================
--  Coupures d'électricité : une ligne par coupure détectée, avec sa cause
--
--  Pourquoi : scripts/detect_coupures.py détecte les coupures mais n'en
--  garde rien. Sans enregistrement, impossible d'attribuer une cause,
--  de confirmer une proposition ni de sortir le camembert des causes.
--
--  Deux niveaux de cause (discussion du 24/09) : un DÉCLENCHEUR et un
--  AGGRAVANT facultatif (ex. SENELEC coupe, puis le groupe ne démarre pas).
--  Une cause proposée par le système n'est jamais une vérité : elle reste
--  « proposee » jusqu'à confirmation (même principe que shelly_device_roles).
-- ============================================================

-- ── 1. Liste des causes (modifiable sans migration) ──────────
create table if not exists coupure_causes (
  code     text primary key,
  origine  text    not null check (origine in ('externe', 'interne', 'a_qualifier', 'non_retenue')),
  libelle  text    not null,
  ordre    int     not null default 0,
  actif    boolean not null default true
);

insert into coupure_causes (code, origine, libelle, ordre) values
  ('reseau_incident',      'externe',     'Réseau SENELEC : incident ou panne de poste',        10),
  ('reseau_programme',     'externe',     'Réseau SENELEC : travaux ou coupure programmée',     20),
  ('foudre',               'externe',     'Foudre / orage',                                     30),
  ('tiers',                'externe',     'Tiers / voisinage (voisin, travaux, câble abîmé)',   40),
  ('surcharge_disjoncteur','interne',     'Surcharge ou déclenchement du disjoncteur',          50),
  ('defaut_installation',  'interne',     'Défaut d''installation (non conforme, court-circuit, isolement)', 60),
  ('groupe_defaillant',    'interne',     'Groupe électrogène non démarré ou en panne',         70),
  ('arret_volontaire',     'interne',     'Arrêt volontaire (absence, maintenance, décision)',  80),
  ('inconnue',             'a_qualifier', 'Cause inconnue',                                     90),
  ('fausse_coupure',       'non_retenue', 'Fausse coupure (trou de collecte, appareil débranché)', 100)
on conflict (code) do nothing;

-- ── 2. Les coupures ──────────────────────────────────────────
create table if not exists coupures (
  id            uuid        primary key default gen_random_uuid(),
  site          text        not null,                       -- même valeur que shelly_cl.site
  debut_at      timestamptz not null,
  fin_at        timestamptz not null,
  duree_min     numeric     generated always as (round(extract(epoch from (fin_at - debut_at)) / 60.0 + 1)) stored,

  -- Énergie non distribuée estimée (kWh) et méthode utilisée, pour pouvoir recalculer plus tard.
  end_kwh       numeric(10,3),
  methode       text        not null default 'secteur-muet/pile-actif v1, seuil 5 min',

  -- Causes
  cause_declencheur text    not null default 'inconnue' references coupure_causes (code),
  cause_aggravante  text             references coupure_causes (code),
  statut_cause      text    not null default 'proposee' check (statut_cause in ('proposee', 'confirmee')),
  cause_indice      text,                                    -- pourquoi cette proposition (« chute de tension à 120 V », « absence déclarée »…)
  commentaire       text,

  confirme_par  uuid        references auth.users (id) on delete set null,
  confirme_at   timestamptz,
  detecte_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint coupures_dates_ck       check (fin_at > debut_at),
  constraint coupures_aggravante_ck  check (cause_aggravante is null or cause_aggravante <> cause_declencheur),
  -- La détection peut être relancée à volonté : une coupure = un (site, début).
  constraint coupures_site_debut_uk  unique (site, debut_at)
);

create index if not exists coupures_site_debut_idx on coupures (site, debut_at desc);

-- ── 3. Sécurité : mêmes règles que shelly_device_roles ───────
alter table coupures       enable row level security;
alter table coupure_causes enable row level security;

drop policy if exists coupures_authenticated_rw on coupures;
create policy coupures_authenticated_rw on coupures
  for all to authenticated using (true) with check (true);

-- La liste des causes se lit ; elle se modifie par migration.
drop policy if exists coupure_causes_read on coupure_causes;
create policy coupure_causes_read on coupure_causes
  for select to authenticated using (true);

-- ── 4. Vue pour le camembert des causes (coupures confirmées) ─
create or replace view coupures_par_cause with (security_invoker = true) as
select c.site,
       c.cause_declencheur           as cause,
       k.libelle,
       k.origine,
       count(*)                      as nb_coupures,
       round(sum(c.duree_min) / 60.0, 2) as duree_h,
       round(sum(c.end_kwh), 3)      as end_kwh
from coupures c
join coupure_causes k on k.code = c.cause_declencheur
where c.statut_cause = 'confirmee'
group by c.site, c.cause_declencheur, k.libelle, k.origine;
