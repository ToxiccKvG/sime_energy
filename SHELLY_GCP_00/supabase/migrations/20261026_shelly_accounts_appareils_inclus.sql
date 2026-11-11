-- Collecte partielle d'un compte Shelly : liste blanche d'appareils.
--
-- NULL (défaut) = tout le compte est collecté, comme avant.
-- Sinon, poll-shelly n'écrit que les device_id listés ; les canaux virtuels
-- (`<id>_1`…) suivent leur appareil parent.
--
-- Premier usage (26/10/2026) : compte « Prestation CER2E », dont on ne relève
-- que la pièce SENELEC (Shelly EM 08f9e0e4d080), pas les prises du logement.
alter table public.shelly_accounts
  add column if not exists appareils_inclus text[];

comment on column public.shelly_accounts.appareils_inclus is
  'Liste blanche de device_id à collecter (NULL = tout le compte). Les canaux virtuels suivent leur parent.';
