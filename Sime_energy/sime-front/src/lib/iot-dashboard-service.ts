// ============================================================
// IOT MODULE — Service Dashboard temps réel
// Toutes les requêtes Supabase pour la vue globale multi-sites.
// Tables : shelly_cl (brut minute) · shelly_cl_horaire (agrégé heure)
// ============================================================

import { supabase } from '@/lib/supabase';

// ── Compte Shelly Cloud (inféré du site) ─────────────────────
export const ACCOUNT_BY_SITE: Record<string, string> = {
  'Ma Maison':      'Compte 1 — Ma Maison',
  'Académie CER2E': 'Compte 2 — Académie CER2E',
};

// Sites connus statiquement — garantit leur présence dans le filtre
// même si le polling est inactif depuis plus de CATALOG_WINDOW_HOURS
const STATIC_KNOWN_SITES = ['Académie CER2E', 'Ma Maison'];

export type DeviceFamily =
  | 'ENERGIE_3PH' | 'ENERGIE_2PH' | 'ENERGIE_1PH'
  | 'LUMIERE' | 'CAPTEUR_ENV' | 'ETAT' | 'INCONNU';

// Mapping device_type → famille (copié de poll-shelly/index.ts)
const FAMILY_BY_TYPE: Record<string, DeviceFamily> = {
  'SHEM-3':'ENERGIE_3PH','SPEM-003CEBEU':'ENERGIE_3PH','SPEM-003CEBEU400':'ENERGIE_3PH',
  'SHEM':'ENERGIE_2PH','SPEM-002CEBEU50':'ENERGIE_2PH',
  'SNPL-00112EU':'ENERGIE_1PH','SNPM-001PCEU16':'ENERGIE_1PH','S3PM-001PCEU16':'ENERGIE_1PH',
  'S3PL-00112EU':'ENERGIE_1PH','S4PL-00416EU':'ENERGIE_1PH','SPSW-104PE16EU':'ENERGIE_1PH','S3PB-O3AR000001':'ENERGIE_1PH',
  'SHCB-1':'LUMIERE','SHBDUO-1':'LUMIERE','SHDM-2':'LUMIERE',
  'SBHT-003C':'CAPTEUR_ENV','S3SN-0U12A':'CAPTEUR_ENV','SHGS-1':'CAPTEUR_ENV',
  'SBDW-002C':'ETAT','SBBT-002C':'ETAT','SBMO-003Z':'ETAT','SHMOS-02':'ETAT','S3SW-001P8EU':'ETAT','LOQED':'ETAT',
};

export function getFamily(type?: string | null): DeviceFamily {
  if (!type) return 'INCONNU';
  if (FAMILY_BY_TYPE[type]) return FAMILY_BY_TYPE[type];
  for (const [key, fam] of Object.entries(FAMILY_BY_TYPE)) {
    if (type.startsWith(key)) return fam;
  }
  return 'INCONNU';
}

// ── Types métiers ────────────────────────────────────────────
export interface Device {
  device_id: string;
  name: string;
  site: string;
  room: string | null;
  device_type: string | null;
  device_family: DeviceFamily;
}

export type Period = 'live' | '1h' | '24h' | '7d' | '30d';

export interface Filters {
  sites: string[];
  rooms: string[];
  families: DeviceFamily[];
  deviceIds: string[];
  period: Period;
  // Sélecteurs temporels pour les modes historiques
  historicDate: string;       // YYYY-MM-DD — utilisé par 1h et 24h
  historicHour: number;       // 0-23 — utilisé par 1h
  historicDateStart: string;  // YYYY-MM-DD — utilisé par 7d et 30d
  historicDateEnd: string;    // YYYY-MM-DD — utilisé par 7d et 30d
}

function _today() { return new Date().toISOString().slice(0, 10); }
function _daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

export const DEFAULT_FILTERS: Filters = {
  sites:     [],
  rooms:     [],
  families:  [],
  deviceIds: [],
  period:    'live',
  historicDate:      _today(),
  historicHour:      Math.max(0, new Date().getHours() - 1),
  historicDateStart: _daysAgo(6),
  historicDateEnd:   _today(),
};

// ── Plage de dates pour un mode historique ───────────────────
// '1h'         → shelly_cl (TIMESTAMPTZ) : ISO avec Z
// '24h'/'7d'/'30d' → shelly_cl_horaire   : sans Z (même format que ProfilChargeTab)
export function getHistoricRange(filters: Filters): { since: string; until: string } {
  const { period } = filters;
  if (period === 'live') {
    return {
      since: new Date(Date.now() - 5 * 60_000).toISOString(),
      until: new Date().toISOString(),
    };
  }
  if (period === '1h') {
    const h = String(filters.historicHour).padStart(2, '0');
    // shelly_cl.ts est TIMESTAMPTZ → on garde le Z
    return {
      since: `${filters.historicDate}T${h}:00:00.000Z`,
      until: `${filters.historicDate}T${h}:59:59.999Z`,
    };
  }
  if (period === '24h') {
    // shelly_cl_horaire.ts_heure : sans Z pour éviter les problèmes de type
    return {
      since: `${filters.historicDate}T00:00:00`,
      until: `${filters.historicDate}T23:59:59`,
    };
  }
  // 7d / 30d
  return {
    since: `${filters.historicDateStart}T00:00:00`,
    until: `${filters.historicDateEnd}T23:59:59`,
  };
}

// ligne brute shelly_cl
export interface ShellyClRow {
  id?: number;
  ts: string;
  site: string;
  room: string | null;
  name: string;
  device_id: string;
  device_type: string | null;
  device_family: string | null;
  state: string | null;
  power_w: number | null;
  voltage_v: number | null;
  current_a: number | null;
  p_a: number | null; p_b: number | null; p_c: number | null;
  v_a: number | null; v_b: number | null; v_c: number | null;
  i_a: number | null; i_b: number | null; i_c: number | null;
  wh_a: number | null; wh_b: number | null; wh_c: number | null; wh_tot: number | null;
  temperature: number | null;
  humidity: number | null;
  battery_level: number | null;
}

// Fenêtre de scan pour le catalogue (7 jours — garantit la présence des sites
// même si le polling est inactif plusieurs jours)
const CATALOG_WINDOW_HOURS = 168;
function catalogSince(): string {
  return new Date(Date.now() - CATALOG_WINDOW_HOURS * 60 * 60_000).toISOString();
}

// ── 1. Liste des sites ───────────────────────────────────────
export async function fetchSites(): Promise<string[]> {
  const { data, error } = await supabase
    .from('shelly_cl')
    .select('site')
    .gte('ts', catalogSince())
    .order('ts', { ascending: false })
    .limit(10000);
  if (error) throw error;
  // Fusionner avec les sites statiquement connus — garantit leur présence
  // même si le polling est inactif plus de CATALOG_WINDOW_HOURS
  const fromDb = (data ?? []).map(r => r.site).filter(Boolean) as string[];
  return Array.from(new Set([...STATIC_KNOWN_SITES, ...fromDb])).sort();
}

// ── 2. Liste des pièces (par site) ───────────────────────────
export async function fetchRooms(sites?: string[]): Promise<string[]> {
  let q = supabase
    .from('shelly_cl')
    .select('room')
    .not('room', 'is', null)
    .gte('ts', catalogSince())
    .order('ts', { ascending: false })
    .limit(10000);
  if (sites && sites.length > 0) q = q.in('site', sites);
  const { data, error } = await q;
  if (error) throw error;
  return Array.from(new Set((data ?? []).map(r => r.room).filter(Boolean) as string[])).sort();
}

// ── 3. Liste des appareils (catalogue, dédupliqué) ───────────
export async function fetchDevices(sites?: string[], families?: DeviceFamily[]): Promise<Device[]> {
  let q = supabase
    .from('shelly_cl')
    .select('device_id,name,site,room,device_type,device_family,ts')
    .gte('ts', catalogSince())
    .order('ts', { ascending: false })
    .limit(20000);
  if (sites && sites.length > 0)       q = q.in('site', sites);
  if (families && families.length > 0) q = q.in('device_family', families);

  const { data, error } = await q;
  if (error) throw error;

  const seen = new Set<string>();
  const devices: Device[] = [];
  for (const r of data ?? []) {
    if (seen.has(r.device_id)) continue;
    seen.add(r.device_id);
    devices.push({
      device_id:     r.device_id,
      name:          r.name ?? r.device_id,
      site:          r.site ?? '',
      room:          r.room,
      device_type:   r.device_type,
      device_family: (r.device_family as DeviceFamily) ?? getFamily(r.device_type),
    });
  }
  return devices.sort((a, b) => a.name.localeCompare(b.name));
}

// ── 4. Snapshot : dernière ligne par device dans les 5 dernières minutes ─
export async function fetchLatestSnapshot(filters: Filters): Promise<ShellyClRow[]> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  let q = supabase
    .from('shelly_cl')
    .select('*')
    .gte('ts', fiveMinAgo)
    .order('ts', { ascending: false })
    .limit(5000);
  if (filters.sites.length > 0)     q = q.in('site', filters.sites);
  if (filters.families.length > 0)  q = q.in('device_family', filters.families);
  if (filters.rooms.length > 0)     q = q.in('room', filters.rooms);
  if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);

  const { data, error } = await q;
  if (error) throw error;

  // Garde la première occurrence par device_id (donc la plus récente, car order desc)
  const seen = new Set<string>();
  const latest: ShellyClRow[] = [];
  for (const r of (data ?? []) as ShellyClRow[]) {
    if (!seen.has(r.device_id)) {
      seen.add(r.device_id);
      latest.push(r);
    }
  }
  return latest;
}

// ── 5. Série temporelle puissance (1h max — pour sparklines) ────
export async function fetchPowerSeries(
  deviceIds: string[],
  minutesBack: number = 60,
): Promise<Array<{ device_id: string; ts: string; power_w: number | null }>> {
  if (deviceIds.length === 0) return [];
  const since = new Date(Date.now() - minutesBack * 60_000).toISOString();
  const { data, error } = await supabase
    .from('shelly_cl')
    .select('device_id,ts,power_w')
    .in('device_id', deviceIds)
    .gte('ts', since)
    .order('ts', { ascending: true })
    .limit(10000);
  if (error) throw error;
  return data ?? [];
}

// ── 6. Énergie agrégée par appareil sur une période ──────────
// Utilise shelly_cl_horaire pour 24h+ (déjà incrémental, plus rapide).
export interface EnergyAgg {
  device_id: string;
  name: string;
  site: string;
  room: string | null;
  family: DeviceFamily;
  kwh: number;
}

export async function fetchEnergyByDevice(
  filters: Filters,
  _period?: Period,
): Promise<EnergyAgg[]> {
  // Mode live : les KPI utilisent le snapshot brut — pas besoin d'agrégat ici
  if (filters.period === 'live') return [];

  const { since, until } = getHistoricRange(filters);

  // ── Mode 1h : table brute shelly_cl (rétention 90j, données minute) ────────
  // shelly_cl_horaire est peuplée par un job d'agrégation avec délai ; shelly_cl
  // est toujours à jour.
  if (filters.period === '1h') {
    let q = supabase
      .from('shelly_cl')
      .select('device_id,name,site,room,device_family,wh_tot,wh_a,wh_b,wh_c,power_w,ts')
      .gte('ts', since)
      .lte('ts', until)
      .order('ts', { ascending: true })
      .limit(10000);
    if (filters.sites.length > 0)     q = q.in('site', filters.sites);
    if (filters.families.length > 0)  q = q.in('device_family', filters.families);
    if (filters.rooms.length > 0)     q = q.in('room', filters.rooms);
    if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);
    const { data, error } = await q;
    if (error) throw error;

    const byDev = new Map<string, { rows: typeof data; meta: EnergyAgg }>();
    for (const r of data ?? []) {
      const cur = byDev.get(r.device_id);
      if (!cur) {
        byDev.set(r.device_id, {
          rows: [r],
          meta: {
            device_id: r.device_id,
            name:      r.name ?? r.device_id,
            site:      r.site ?? '',
            room:      r.room,
            family:    (r.device_family as DeviceFamily) ?? 'INCONNU',
            kwh:       0,
          },
        });
      } else {
        cur.rows!.push(r);
      }
    }

    const result: EnergyAgg[] = [];
    for (const { rows, meta } of byDev.values()) {
      if (!rows || rows.length === 0) continue;
      if (rows.length < 2) {
        // Un seul relevé : puissance × 1h ≈ énergie
        meta.kwh = Math.max(0, Number(rows[0]?.power_w ?? 0)) / 1000;
      } else {
        // Delta wh_tot entre le premier et le dernier relevé de l'heure
        const first = rows[0];
        const last  = rows[rows.length - 1];
        const w0 = Number(first.wh_tot ?? ((first.wh_a ?? 0) + (first.wh_b ?? 0) + (first.wh_c ?? 0)));
        const w1 = Number(last.wh_tot  ?? ((last.wh_a  ?? 0) + (last.wh_b  ?? 0) + (last.wh_c  ?? 0)));
        meta.kwh = Math.max(0, (w1 - w0) / 1000);
      }
      result.push(meta);
    }
    return result.sort((a, b) => b.kwh - a.kwh);
  }

  // ── Mode 24h : table brute shelly_cl — même logique que 1h mais sur la journée ─
  // shelly_cl_horaire n'a pas de job d'agrégation actif → toujours vide pour les
  // dates récentes. On lit shelly_cl directement (rétention 90j, toujours à jour).
  if (filters.period === '24h') {
    const sinceFull = `${filters.historicDate}T00:00:00.000Z`;
    const untilFull = `${filters.historicDate}T23:59:59.999Z`;
    let q = supabase
      .from('shelly_cl')
      .select('device_id,name,site,room,device_family,wh_tot,wh_a,wh_b,wh_c,ts')
      .gte('ts', sinceFull)
      .lte('ts', untilFull)
      .order('ts', { ascending: true })
      .limit(50000);
    if (filters.sites.length > 0)     q = q.in('site', filters.sites);
    if (filters.families.length > 0)  q = q.in('device_family', filters.families);
    if (filters.rooms.length > 0)     q = q.in('room', filters.rooms);
    if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);
    const { data, error } = await q;
    if (error) throw error;

    const byDev = new Map<string, { rows: typeof data; meta: EnergyAgg }>();
    for (const r of data ?? []) {
      const cur = byDev.get(r.device_id);
      if (!cur) {
        byDev.set(r.device_id, {
          rows: [r],
          meta: {
            device_id: r.device_id,
            name:      r.name ?? r.device_id,
            site:      r.site ?? '',
            room:      r.room,
            family:    (r.device_family as DeviceFamily) ?? 'INCONNU',
            kwh:       0,
          },
        });
      } else {
        cur.rows!.push(r);
      }
    }

    const result: EnergyAgg[] = [];
    for (const { rows, meta } of byDev.values()) {
      if (!rows || rows.length < 2) continue;
      const r0 = rows[0], rN = rows[rows.length - 1];
      const w0 = Number(r0.wh_tot ?? ((r0.wh_a ?? 0) + (r0.wh_b ?? 0) + (r0.wh_c ?? 0)));
      const w1 = Number(rN.wh_tot ?? ((rN.wh_a ?? 0) + (rN.wh_b ?? 0) + (rN.wh_c ?? 0)));
      meta.kwh = Math.max(0, (w1 - w0) / 1000);
      result.push(meta);
    }
    return result.sort((a, b) => b.kwh - a.kwh);
  }

  // ── Modes 7d / 30d : table horaire shelly_cl_horaire ────────────────────────
  let q = supabase
    .from('shelly_cl_horaire')
    .select('device_id,name,site,device_family,wh_conso,ts_heure')
    .gte('ts_heure', since)
    .lte('ts_heure', until)
    .limit(50000);
  if (filters.sites.length > 0)     q = q.in('site', filters.sites);
  if (filters.families.length > 0)  q = q.in('device_family', filters.families);
  if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);
  const { data, error } = await q;
  if (error) throw error;

  const agg = new Map<string, EnergyAgg>();
  for (const r of data ?? []) {
    const cur = agg.get(r.device_id) ?? {
      device_id: r.device_id,
      name:      r.name ?? r.device_id,
      site:      r.site ?? '',
      room:      null,
      family:    (r.device_family as DeviceFamily) ?? 'INCONNU',
      kwh:       0,
    };
    cur.kwh += Number(r.wh_conso ?? 0) / 1000;
    agg.set(r.device_id, cur);
  }
  return Array.from(agg.values()).sort((a, b) => b.kwh - a.kwh);
}

// ── 7. Heatmap appareils × heures (24 dernières heures par défaut) ─
export interface HeatmapCell {
  device_id: string;
  name: string;
  hour: number;          // 0-23
  kwh: number;
}

// Helpers heatmap (privés)
type RawRow     = { device_id: string; name: string; ts: string; power_w: number | null };
type HoraireRow = { device_id: string; name: string; ts_heure: string; wh_conso: number | null };
type HeatAcc    = Map<string, { name: string; sums: number[]; counts: number[] }>;

function _heatAcc(): HeatAcc { return new Map(); }
function _heatFlat(acc: HeatAcc): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (const [device_id, { name, sums, counts }] of acc.entries())
    for (let h = 0; h < 24; h++)
      cells.push({ device_id, name, hour: h, kwh: counts[h] > 0 ? sums[h] / counts[h] : 0 });
  return cells;
}
function _heatAddRaw(acc: HeatAcc, rows: RawRow[]) {
  for (const r of rows) {
    if (r.power_w == null) continue;
    const hour = new Date(r.ts).getHours();
    const cur = acc.get(r.device_id) ?? { name: r.name ?? r.device_id, sums: Array(24).fill(0), counts: Array(24).fill(0) };
    cur.sums[hour]   += r.power_w / 1000; // W → kW ≈ kWh/h
    cur.counts[hour] += 1;
    acc.set(r.device_id, cur);
  }
}
function _heatAddHoraire(acc: HeatAcc, rows: HoraireRow[]) {
  for (const r of rows) {
    const hour = new Date(r.ts_heure).getHours();
    const cur = acc.get(r.device_id) ?? { name: r.name ?? r.device_id, sums: Array(24).fill(0), counts: Array(24).fill(0) };
    cur.sums[hour]   += Number(r.wh_conso ?? 0) / 1000;
    cur.counts[hour] += 1;
    acc.set(r.device_id, cur);
  }
}

export async function fetchHourlyHeatmap(filters: Filters, _period?: Period): Promise<HeatmapCell[]> {
  const { period } = filters;

  // ── live / 1h / 24h : lire shelly_cl (fenêtre ≤ 24h, toujours à jour) ──────
  if (period === 'live' || period === '1h' || period === '24h') {
    const since = period === 'live'
      ? new Date(Date.now() - 24 * 60 * 60_000).toISOString()
      : `${filters.historicDate}T00:00:00.000Z`;
    const until = period === 'live'
      ? new Date().toISOString()
      : `${filters.historicDate}T23:59:59.999Z`;
    let q = supabase
      .from('shelly_cl')
      .select('device_id,name,ts,power_w')
      .gte('ts', since).lte('ts', until)
      .order('ts', { ascending: true })
      .limit(100_000);
    if (filters.sites.length > 0)     q = q.in('site', filters.sites);
    if (filters.families.length > 0)  q = q.in('device_family', filters.families);
    if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);
    const { data, error } = await q;
    if (error) throw error;
    const acc = _heatAcc(); _heatAddRaw(acc, data ?? []); return _heatFlat(acc);
  }

  // ── 7d / 30d : shelly_cl_horaire (agrégat horaire) ───────────────────────
  // Fallback sur shelly_cl si horaire est vide (job d'agrégation inactif).
  const { since, until } = getHistoricRange(filters);
  let qH = supabase
    .from('shelly_cl_horaire')
    .select('device_id,name,ts_heure,wh_conso')
    .gte('ts_heure', since).lte('ts_heure', until)
    .order('ts_heure', { ascending: true })
    .limit(50_000);
  if (filters.sites.length > 0)     qH = qH.in('site', filters.sites);
  if (filters.families.length > 0)  qH = qH.in('device_family', filters.families);
  if (filters.deviceIds.length > 0) qH = qH.in('device_id', filters.deviceIds);
  const { data: horaireData, error: horaireErr } = await qH;
  if (horaireErr) throw horaireErr;

  if ((horaireData ?? []).length > 0) {
    const acc = _heatAcc(); _heatAddHoraire(acc, horaireData!); return _heatFlat(acc);
  }

  // Fallback : shelly_cl — données les plus récentes en premier (ordre DESC)
  const toZ = (s: string) => s.endsWith('Z') ? s : `${s}Z`;
  let qR = supabase
    .from('shelly_cl')
    .select('device_id,name,ts,power_w')
    .gte('ts', toZ(since)).lte('ts', toZ(until))
    .order('ts', { ascending: false })
    .limit(100_000);
  if (filters.sites.length > 0)     qR = qR.in('site', filters.sites);
  if (filters.families.length > 0)  qR = qR.in('device_family', filters.families);
  if (filters.deviceIds.length > 0) qR = qR.in('device_id', filters.deviceIds);
  const { data: rawData } = await qR; // best-effort, ignore error
  const acc = _heatAcc(); _heatAddRaw(acc, rawData ?? []); return _heatFlat(acc);
}

// ── 8. Calendrier d'activité (90 jours) ──────────────────────
export interface CalendarDay {
  date: string;   // YYYY-MM-DD
  kwh: number;
}

// ts_heure est TIMESTAMP (sans timezone) → strip le Z et les ms
function toHoraireTs(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
}

export async function fetchCalendarActivity(filters: Filters): Promise<CalendarDay[]> {
  // Live → 90 derniers jours ; historique → plage sélectionnée (élargie si besoin)
  const since = filters.period === 'live'
    ? toHoraireTs(new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString())
    : toHoraireTs(getHistoricRange(filters).since);
  const until = filters.period === 'live'
    ? toHoraireTs(new Date().toISOString())
    : toHoraireTs(getHistoricRange(filters).until);
  let q = supabase
    .from('shelly_cl_horaire')
    .select('ts_heure,wh_conso')
    .gte('ts_heure', since)
    .lte('ts_heure', until)
    .limit(50000);
  if (filters.sites.length > 0)     q = q.in('site', filters.sites);
  if (filters.families.length > 0)  q = q.in('device_family', filters.families);
  if (filters.deviceIds.length > 0) q = q.in('device_id', filters.deviceIds);
  const { data, error } = await q;
  if (error) throw error;

  const byDay = new Map<string, number>();
  for (const r of data ?? []) {
    const day = r.ts_heure.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(r.wh_conso ?? 0) / 1000));
  }

  // Gap-fill : compléter avec shelly_cl si horaire n'a pas de données récentes
  // (job d'agrégation inactif). Chaque ligne shelly_cl ≈ 1 min → kWh = power_w/60000.
  const today = new Date().toISOString().slice(0, 10);
  const lastHoraireDay = byDay.size > 0
    ? Array.from(byDay.keys()).sort().pop()!
    : new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const gapDays = Math.round((Date.now() - new Date(lastHoraireDay + 'T00:00:00Z').getTime()) / 86_400_000);

  if (gapDays >= 1) {
    const gapSince = `${lastHoraireDay}T23:00:00.000Z`; // chevauchement d'1h
    const gapUntil = `${today}T23:59:59.999Z`;
    let qRaw = supabase
      .from('shelly_cl')
      .select('ts,power_w')
      .gte('ts', gapSince).lte('ts', gapUntil)
      .order('ts', { ascending: true })
      .limit(200_000);
    if (filters.sites.length > 0)     qRaw = qRaw.in('site', filters.sites);
    if (filters.families.length > 0)  qRaw = qRaw.in('device_family', filters.families);
    if (filters.deviceIds.length > 0) qRaw = qRaw.in('device_id', filters.deviceIds);
    const { data: rawData } = await qRaw; // best-effort
    for (const r of rawData ?? []) {
      if (r.power_w == null) continue;
      const day = r.ts.slice(0, 10);
      if (day <= lastHoraireDay) continue; // ne pas écraser les données horaire
      byDay.set(day, (byDay.get(day) ?? 0) + r.power_w / 60_000);
    }
  }

  return Array.from(byDay.entries()).map(([date, kwh]) => ({ date, kwh })).sort((a, b) => a.date.localeCompare(b.date));
}

// ── 9. Alertes / anomalies (calculées client à partir du snapshot) ─
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  type:
    | 'offline' | 'battery_low' | 'voltage_anormal'
    | 'power_anormal' | 'temp_critical' | 'motion_detected' | 'door_open';
  device_id: string;
  device_name: string;
  site: string;
  room: string | null;
  message: string;
  value?: number | string;
  ts: string;
}

export function computeAlerts(snapshot: ShellyClRow[], allDevices: Device[]): Alert[] {
  const alerts: Alert[] = [];
  const onlineIds = new Set(snapshot.map(r => r.device_id));
  const nowIso = new Date().toISOString();

  // Offline : device dans le catalogue mais pas dans le snapshot 5min
  for (const d of allDevices) {
    if (onlineIds.has(d.device_id)) continue;
    alerts.push({
      id: `offline-${d.device_id}`,
      severity: 'warning',
      type: 'offline',
      device_id: d.device_id,
      device_name: d.name,
      site: d.site,
      room: d.room,
      message: `Hors-ligne depuis > 5 min`,
      ts: nowIso,
    });
  }

  for (const r of snapshot) {
    // Batterie faible
    if (typeof r.battery_level === 'number' && r.battery_level < 20) {
      alerts.push({
        id: `bat-${r.device_id}`,
        severity: r.battery_level < 10 ? 'critical' : 'warning',
        type: 'battery_low',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Batterie faible : ${r.battery_level}%`,
        value: r.battery_level, ts: r.ts,
      });
    }
    // Tension anormale (sur les appareils énergie)
    if (typeof r.voltage_v === 'number' && r.voltage_v > 0 && (r.voltage_v < 200 || r.voltage_v > 250)) {
      alerts.push({
        id: `volt-${r.device_id}`,
        severity: 'warning',
        type: 'voltage_anormal',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Tension hors plage : ${r.voltage_v.toFixed(1)} V`,
        value: r.voltage_v, ts: r.ts,
      });
    }
    // Puissance anormale monophasé (> 5 kW)
    if (r.device_family === 'ENERGIE_1PH' && typeof r.power_w === 'number' && r.power_w > 5000) {
      alerts.push({
        id: `pow-${r.device_id}`,
        severity: 'critical',
        type: 'power_anormal',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Puissance anormale : ${(r.power_w / 1000).toFixed(2)} kW`,
        value: r.power_w, ts: r.ts,
      });
    }
    // Température critique
    if (typeof r.temperature === 'number' && (r.temperature < 10 || r.temperature > 40)) {
      alerts.push({
        id: `temp-${r.device_id}`,
        severity: 'warning',
        type: 'temp_critical',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Température : ${r.temperature.toFixed(1)} °C`,
        value: r.temperature, ts: r.ts,
      });
    }
    // Mouvement détecté
    if (r.state === 'motion') {
      alerts.push({
        id: `motion-${r.device_id}-${r.ts}`,
        severity: 'info',
        type: 'motion_detected',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Mouvement détecté`,
        ts: r.ts,
      });
    }
    // Porte ouverte
    if (r.state === 'open') {
      alerts.push({
        id: `door-${r.device_id}`,
        severity: 'info',
        type: 'door_open',
        device_id: r.device_id, device_name: r.name, site: r.site, room: r.room,
        message: `Porte ouverte`,
        ts: r.ts,
      });
    }
  }

  // Tri par sévérité puis date desc
  const sevOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.ts.localeCompare(a.ts));
}

// ── Utilitaires ──────────────────────────────────────────────
function periodToMinutes(p: Period): number {
  switch (p) {
    case 'live':  return 5;
    case '1h':    return 60;
    case '24h':   return 24 * 60;
    case '7d':    return 7 * 24 * 60;
    case '30d':   return 30 * 24 * 60;
  }
}

export function isMainMeter(name: string): boolean {
  const upper = name.toUpperCase();
  return /(^|_)M\d_|SENELEC|TGBT|CHARGE_CONSOMMATION|EM-SENELEC/.test(upper);
}

export function isPVMeter(name: string): boolean {
  return /PV/i.test(name);
}
