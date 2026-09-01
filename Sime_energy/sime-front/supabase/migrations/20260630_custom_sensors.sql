-- Table des capteurs personnalisés par organisation
create table if not exists custom_sensors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  timestamp_col    text not null,
  timestamp_format text,
  value_col        text not null,
  unit             text not null,
  metric_label     text not null,
  extra_cols       jsonb not null default '[]',
  keep_negative    boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table custom_sensors enable row level security;

-- Seuls les membres de l'organisation peuvent lire/modifier leurs capteurs
create policy "custom_sensors_org_members" on custom_sensors
  for all
  using (
    organization_id in (
      select organization_id from organization_users where user_id = auth.uid()
    )
  );
