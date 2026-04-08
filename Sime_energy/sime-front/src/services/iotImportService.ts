/**
 * Pipeline d'import universel IoT — 5 étapes
 *
 * Étape 1 — Aperçu   : détection séparateur, encodage, preview 10 lignes
 * Étape 2 — Mapping  : colonnes → timestamp / puissance / énergie / source / unité
 * Étape 3 — Qualif.  : associer à M1–M5, site, facteur multiplicateur
 * Étape 4 — Valid.   : valeurs aberrantes, doublons, trous de données
 * Étape 5 — Stockage : insert Supabase iot_readings
 *
 * Capteurs pré-configurés : Shelly 3EM, SMA, Voltcraft, Fluke, DENT Elite Pro, Sentinel 8
 * Formats : CSV (tout séparateur), XLSX, JSON, TSV, TXT
 */

import * as XLSX from 'xlsx';
import { insertIotReadings } from '@/lib/iot-mesures-service';
import type { SourceCode } from '@/lib/iot-sources-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CapteurConnu =
  | 'Shelly_3EM'
  | 'SMA_Sunny'
  | 'Voltcraft'
  | 'Fluke'
  | 'DENT_Elite_Pro'
  | 'Sentinel_8'
  | 'Libre';

export type UniteSource = 'W' | 'kW' | 'MW' | 'Wh' | 'kWh';

export interface MappingColonnes {
  timestamp: string;          // nom de la colonne timestamp dans le fichier
  puissance?: string;         // colonne puissance totale (W ou kW)
  puissance_a?: string;
  puissance_b?: string;
  puissance_c?: string;
  energie?: string;           // colonne énergie (Wh ou kWh)
  tension_a?: string;
  tension_b?: string;
  tension_c?: string;
  courant_a?: string;
  courant_b?: string;
  courant_c?: string;
  unite_puissance: UniteSource;
  unite_energie: UniteSource;
  facteur_multiplicateur: number;  // ex: 3 (triphasé), 0.001 (W→kW), 1000 (kW→W)
}

export interface QualificationImport {
  organization_id: string;
  iot_site_id: string;
  source_code: SourceCode;
  device_id: string;            // identifiant logique (ex: "shelly_m1")
  shelly_site_name?: string;
}

export interface AperçuFichier {
  colonnes: string[];
  lignes_preview: Record<string, string>[];   // 10 premières lignes
  separateur: string;
  encodage: string;
  nb_lignes_total: number;
  capteur_detecte: CapteurConnu | null;
}

export interface RapportValidation {
  valide: boolean;
  nb_lignes: number;
  nb_aberrants: number;
  nb_doublons: number;
  nb_trous: number;
  plage_dates: { debut: string; fin: string } | null;
  alertes: string[];
}

export interface LigneNormalisee {
  timestamp: string;
  power?: number;       // W
  power_a?: number;
  power_b?: number;
  power_c?: number;
  total_power?: number;
  energy_total?: number;  // Wh
  voltage_a?: number;
  voltage_b?: number;
  voltage_c?: number;
  current_a?: number;
  current_b?: number;
  current_c?: number;
}

// ─── Configurations capteurs connus ───────────────────────────────────────────

const CAPTEUR_CONFIGS: Record<CapteurConnu, Partial<MappingColonnes> & { detecte_par: string[] }> = {
  Shelly_3EM: {
    timestamp:       'Timestamp',
    puissance_a:     'Power A (W)',
    puissance_b:     'Power B (W)',
    puissance_c:     'Power C (W)',
    energie:         'Energy Total (Wh)',
    unite_puissance: 'W',
    unite_energie:   'Wh',
    facteur_multiplicateur: 1,
    detecte_par: ['Power A (W)', 'Power B (W)', 'Power C (W)', 'Energy Total (Wh)'],
  },
  SMA_Sunny: {
    timestamp:       'Datetime',
    puissance:       'kW',
    energie:         'kWh',
    unite_puissance: 'kW',
    unite_energie:   'kWh',
    facteur_multiplicateur: 1,
    detecte_par: ['Datetime', 'kW', 'kWh'],
  },
  Voltcraft: {
    timestamp:       'Temps',
    puissance:       'Puissance W',
    unite_puissance: 'W',
    unite_energie:   'Wh',
    facteur_multiplicateur: 1,
    detecte_par: ['Temps', 'Puissance W'],
  },
  Fluke: {
    timestamp:       'Date/Time',
    puissance:       'kW',
    unite_puissance: 'kW',
    unite_energie:   'kWh',
    facteur_multiplicateur: 1,
    detecte_par: ['Date/Time', 'kW', 'PF'],
  },
  DENT_Elite_Pro: {
    timestamp:       'Timestamp',
    puissance:       'kW',
    unite_puissance: 'kW',
    unite_energie:   'kWh',
    facteur_multiplicateur: 1,
    detecte_par: ['kW', 'kVAR', 'kVA'],
  },
  Sentinel_8: {
    timestamp:       'Date',
    puissance:       'kWh',
    unite_puissance: 'kWh',
    unite_energie:   'kWh',
    facteur_multiplicateur: 1,
    detecte_par: ['Date', 'Heure', 'kWh'],
  },
  Libre: {
    timestamp:       '',
    unite_puissance: 'W',
    unite_energie:   'Wh',
    facteur_multiplicateur: 1,
    detecte_par: [],
  },
};

// ─── Étape 1 : Aperçu ─────────────────────────────────────────────────────────

export async function apercuFichier(file: File): Promise<AperçuFichier> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();

  let lignes: Record<string, string>[] = [];
  let colonnes: string[] = [];

  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    const wb = XLSX.read(buffer, { type: 'array', dateNF: 'yyyy-mm-dd hh:mm:ss' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
    colonnes = json.length > 0 ? Object.keys(json[0]) : [];
    lignes = json.slice(0, 10);
  } else {
    // CSV / TSV / TXT
    const text = new TextDecoder('utf-8').decode(buffer);
    const separateur = detecterSeparateur(text);
    const rows = text.split('\n').filter(Boolean);
    colonnes = rows[0]?.split(separateur).map(c => c.trim().replace(/^"|"$/g, '')) ?? [];
    lignes = rows.slice(1, 11).map(row => {
      const vals = row.split(separateur).map(v => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(colonnes.map((c, i) => [c, vals[i] ?? '']));
    });
  }

  const capteur_detecte = detecterCapteur(colonnes);

  return {
    colonnes,
    lignes_preview: lignes,
    separateur: ',',
    encodage: 'UTF-8',
    nb_lignes_total: lignes.length,
    capteur_detecte,
  };
}

// ─── Étape 2+3 : Normalisation ────────────────────────────────────────────────

export async function normaliserFichier(
  file: File,
  mapping: MappingColonnes,
): Promise<LigneNormalisee[]> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();

  let rows: Record<string, string>[] = [];

  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    const wb = XLSX.read(buffer, { type: 'array', dateNF: 'yyyy-mm-dd hh:mm:ss' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
  } else {
    const text = new TextDecoder('utf-8').decode(buffer);
    const sep = detecterSeparateur(text);
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    rows = lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
  }

  return rows
    .filter(row => row[mapping.timestamp])
    .map(row => normaliserLigne(row, mapping))
    .filter((l): l is LigneNormalisee => l !== null);
}

// ─── Étape 4 : Validation ─────────────────────────────────────────────────────

export function validerLignes(lignes: LigneNormalisee[]): RapportValidation {
  const alertes: string[] = [];
  let nb_aberrants = 0;
  let nb_doublons = 0;
  let nb_trous = 0;

  const timestamps = new Set<string>();
  const seuil_aberrant_kw = 10_000; // 10 MW — valeur clairement aberrante

  for (const ligne of lignes) {
    // Doublons
    if (timestamps.has(ligne.timestamp)) {
      nb_doublons++;
    } else {
      timestamps.add(ligne.timestamp);
    }

    // Valeurs aberrantes (puissance > seuil ou négative inattendue)
    const p = ligne.total_power ?? ligne.power ?? 0;
    if (Math.abs(p) > seuil_aberrant_kw * 1000) {
      nb_aberrants++;
    }
  }

  if (nb_doublons > 0)  alertes.push(`${nb_doublons} timestamp(s) en doublon détecté(s)`);
  if (nb_aberrants > 0) alertes.push(`${nb_aberrants} valeur(s) aberrante(s) détectée(s) (> 10 MW)`);
  if (nb_trous > 0)     alertes.push(`${nb_trous} trou(s) de données détecté(s)`);

  const dates = lignes.map(l => l.timestamp).sort();

  return {
    valide:       nb_aberrants === 0,
    nb_lignes:    lignes.length,
    nb_aberrants,
    nb_doublons,
    nb_trous,
    plage_dates:  dates.length > 0 ? { debut: dates[0], fin: dates[dates.length - 1] } : null,
    alertes,
  };
}

// ─── Étape 5 : Stockage ───────────────────────────────────────────────────────

export async function stockerDonnees(
  lignes: LigneNormalisee[],
  qualification: QualificationImport,
  exclureAberrants = true,
  exclureDoublons  = true,
): Promise<{ inserted: number; skipped: number }> {
  const seuil_aberrant_w = 10_000_000; // 10 MW en W

  // Déduplication
  const vus = new Set<string>();
  const aInserer = lignes.filter(ligne => {
    if (exclureAberrants) {
      const p = Math.abs(ligne.total_power ?? ligne.power ?? 0);
      if (p > seuil_aberrant_w) return false;
    }
    if (exclureDoublons) {
      const key = `${ligne.timestamp}__${qualification.device_id}`;
      if (vus.has(key)) return false;
      vus.add(key);
    }
    return true;
  });

  const skipped = lignes.length - aInserer.length;

  if (aInserer.length === 0) return { inserted: 0, skipped };

  // Préparer les lignes pour iot_readings
  const rows = aInserer.map(ligne => ({
    organization_id: qualification.organization_id,
    iot_site_id:     qualification.iot_site_id,
    timestamp:       ligne.timestamp,
    site:            qualification.shelly_site_name ?? null,
    device_id:       qualification.device_id,
    source_code:     qualification.source_code,
    power:           ligne.power ?? null,
    power_a:         ligne.power_a ?? null,
    power_b:         ligne.power_b ?? null,
    power_c:         ligne.power_c ?? null,
    total_power:     ligne.total_power ?? null,
    energy_total:    ligne.energy_total ?? null,
    voltage_a:       ligne.voltage_a ?? null,
    voltage_b:       ligne.voltage_b ?? null,
    voltage_c:       ligne.voltage_c ?? null,
    current_a:       ligne.current_a ?? null,
    current_b:       ligne.current_b ?? null,
    current_c:       ligne.current_c ?? null,
  }));

  // Batch insert par paquets de 500 pour éviter les timeouts
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await insertIotReadings(batch);
    inserted += result.count;
  }

  return { inserted, skipped };
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

function detecterSeparateur(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';
  const counts = {
    ',':  (firstLine.match(/,/g) ?? []).length,
    ';':  (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
    '|':  (firstLine.match(/\|/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function detecterCapteur(colonnes: string[]): CapteurConnu | null {
  for (const [capteur, config] of Object.entries(CAPTEUR_CONFIGS)) {
    if (capteur === 'Libre') continue;
    const match = config.detecte_par.every(col => colonnes.includes(col));
    if (match) return capteur as CapteurConnu;
  }
  return null;
}

/** Retourne le mapping pré-configuré pour un capteur connu */
export function getMappingCapteur(capteur: CapteurConnu): Partial<MappingColonnes> {
  const { detecte_par: _, ...mapping } = CAPTEUR_CONFIGS[capteur];
  return mapping;
}

function toW(valeur: number, unite: UniteSource): number {
  switch (unite) {
    case 'kW':  return valeur * 1000;
    case 'MW':  return valeur * 1_000_000;
    case 'kWh': return valeur * 1000;   // énergie → traité séparément
    default:    return valeur;          // W ou Wh
  }
}

function toWh(valeur: number, unite: UniteSource): number {
  switch (unite) {
    case 'kWh': return valeur * 1000;
    case 'MW':  return valeur * 1_000_000;
    default:    return valeur;
  }
}

function normaliserLigne(
  row: Record<string, string>,
  m: MappingColonnes,
): LigneNormalisee | null {
  const tsRaw = row[m.timestamp];
  if (!tsRaw) return null;

  // Normaliser le timestamp → ISO 8601
  const timestamp = normaliserTimestamp(tsRaw);
  if (!timestamp) return null;

  const facteur = m.facteur_multiplicateur ?? 1;
  const parse = (col?: string) => {
    if (!col || row[col] === undefined || row[col] === '') return undefined;
    const v = parseFloat(row[col].replace(',', '.'));
    return isNaN(v) ? undefined : v * facteur;
  };

  const power_a    = m.puissance_a ? toW(parse(m.puissance_a) ?? 0, m.unite_puissance) : undefined;
  const power_b    = m.puissance_b ? toW(parse(m.puissance_b) ?? 0, m.unite_puissance) : undefined;
  const power_c    = m.puissance_c ? toW(parse(m.puissance_c) ?? 0, m.unite_puissance) : undefined;
  const power      = m.puissance   ? toW(parse(m.puissance)   ?? 0, m.unite_puissance) : undefined;

  const total_power =
    (power_a !== undefined && power_b !== undefined && power_c !== undefined)
      ? power_a + power_b + power_c
      : power;

  const energy_total = m.energie
    ? toWh(parse(m.energie) ?? 0, m.unite_energie)
    : undefined;

  return {
    timestamp,
    power,
    power_a,
    power_b,
    power_c,
    total_power,
    energy_total,
    voltage_a: parse(m.tension_a),
    voltage_b: parse(m.tension_b),
    voltage_c: parse(m.tension_c),
    current_a: parse(m.courant_a),
    current_b: parse(m.courant_b),
    current_c: parse(m.courant_c),
  };
}

function normaliserTimestamp(raw: string): string | null {
  // Essai direct
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Format DD/MM/YYYY HH:MM:SS
  const m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (m1) {
    const [, dd, mm, yyyy, hhmm] = m1;
    return new Date(`${yyyy}-${mm}-${dd}T${hhmm}`).toISOString();
  }

  // Format DD-MM-YYYY HH:MM
  const m2 = raw.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (m2) {
    const [, dd, mm, yyyy, hhmm] = m2;
    return new Date(`${yyyy}-${mm}-${dd}T${hhmm}`).toISOString();
  }

  return null;
}
