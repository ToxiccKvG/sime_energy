import { supabase } from './supabase';

export interface ExtraCol {
  label: string;
  col: string;
}

export type QuantityKind = 'power' | 'energy' | 'other';

const POWER_UNITS = new Set(['w', 'kw', 'mw', 'va', 'kva', 'var', 'kvar']);
const ENERGY_UNITS = new Set(['wh', 'kwh', 'mwh', 'vah', 'kvah', 'varh', 'kvarh']);

/**
 * Devine le type de grandeur à partir de l'unité tapée par l'utilisateur — sert
 * de valeur par défaut intelligente dans le formulaire de capteur personnalisé,
 * pour éviter qu'une puissance (W/kW…) reste sur "energy" par défaut et soit
 * sommée au lieu d'être intégrée dans le temps (calcul physiquement faux).
 * Reste un simple point de départ : l'utilisateur peut toujours corriger via le
 * sélecteur "Type de grandeur".
 */
export function guessQuantityKind(unit: string): QuantityKind {
  const u = unit.trim().toLowerCase();
  if (!u) return 'other';
  if (POWER_UNITS.has(u)) return 'power';
  if (ENERGY_UNITS.has(u)) return 'energy';
  return 'other';
}

export interface CustomSensor {
  id: string;
  organization_id: string;
  name: string;
  timestamp_col: string;
  /** Colonne heure séparée (loggers DATE + TIME), fusionnée côté backend. */
  time_col?: string | null;
  timestamp_format?: string;
  /** Empreinte des en-têtes du fichier exemple — reconnaissance automatique des fichiers du même appareil. */
  columns_signature?: string | null;
  value_col: string;
  unit: string;
  metric_label: string;
  extra_cols: ExtraCol[];
  keep_negative: boolean;
  /** Puissance instantanée (intégrée en énergie) / Énergie déjà cumulable (sommée) / Autre (pas de cumul). */
  quantity_kind?: QuantityKind;
  created_at: string;
}

export type CustomSensorInput = Omit<CustomSensor, 'id' | 'created_at'>;

export async function getCustomSensors(organizationId: string): Promise<CustomSensor[]> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomSensor[];
}

export async function saveCustomSensor(sensor: CustomSensorInput): Promise<CustomSensor> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .insert(sensor)
    .select()
    .single();
  // PostgrestError n'est pas une Error : affiché tel quel par un toast il
  // donne « [object Object] ». On remonte un message lisible (c'est ainsi
  // qu'on a vu la colonne quantity_kind manquante, migration 20260917).
  if (error) throw new Error(`${error.message}${error.hint ? ` — ${error.hint}` : ''}`);
  return data as CustomSensor;
}

export async function deleteCustomSensor(id: string): Promise<void> {
  const { error } = await supabase.from('custom_sensors').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCustomSensor(id: string, patch: Partial<CustomSensorInput>): Promise<CustomSensor> {
  const { data, error } = await supabase
    .from('custom_sensors')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomSensor;
}

// ============================================================
// Aide à la configuration : signature, suggestions, aperçu des dates
// ============================================================

/** Empreinte des en-têtes : normalisés, triés, joints — insensible à l'ordre et à la casse. */
export function columnsSignature(columns: string[]): string {
  return columns
    .map(c => c.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort()
    .join('|');
}

/** Retrouve le capteur dont le fichier exemple avait exactement ces en-têtes. */
export function findSensorBySignature(sensors: CustomSensor[], columns: string[]): CustomSensor | undefined {
  const sig = columnsSignature(columns);
  return sig ? sensors.find(s => s.columns_signature === sig) : undefined;
}

const DATE_RE = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/;
const TIME_ONLY_RE = /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/;
const HAS_TIME_RE = /\d{1,2}:\d{2}/;
const INDEX_COL_RE = /^(no\.?|n°|#|index|idx|id|row|ligne|num(?:ero)?)$/i;

/** Extrait l'unité d'un en-tête « Temperature(°C) », « Tension (V) », « Power [kW] ». */
export function unitFromHeader(header: string): string {
  const m = header.match(/[([]\s*([^)\]]{1,12}?)\s*[)\]]\s*$/);
  return m ? m[1].trim() : '';
}

/** Libellé lisible à partir d'un en-tête : « RELATIVE-HUMIDITY » → « Relative humidity ». */
export function labelFromHeader(header: string): string {
  const base = header.replace(/[([][^)\]]*[)\]]\s*$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return header;
  const lower = base.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function unitFromMeta(meta: Record<string, string>, header: string): string {
  // « Temperature Unit:Celsius » → °C, « Fahrenheit » → °F
  const key = Object.keys(meta).find(k => /unit/i.test(k) && new RegExp(header.split(/[^a-z]/i)[0] || '.', 'i').test(k));
  const v = key ? meta[key].toLowerCase() : '';
  if (/celsius/.test(v)) return '°C';
  if (/fahrenheit/.test(v)) return '°F';
  return v ? meta[key!] : '';
}

export interface MappingSuggestion {
  name: string;
  timestampCol: string;
  timeCol: string;
  valueCol: string;
  unit: string;
  metricLabel: string;
  extraCols: ExtraCol[];
}

/**
 * Propose un mapping complet à partir des en-têtes, de quelques lignes et du
 * préambule éventuel. Tout reste modifiable par l'utilisateur : ce sont des
 * valeurs par défaut, pas des décisions.
 */
export function suggestMapping(
  columns: string[],
  sample: Record<string, unknown>[],
  meta: Record<string, string>,
  fileName: string,
): MappingSuggestion {
  const first = (c: string) => sample.map(r => r[c]).find(v => v !== null && v !== undefined && String(v).trim() !== '');
  const str = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''));

  const dateCols = columns.filter(c => { const v = first(c); return v instanceof Date || DATE_RE.test(str(v)); });
  const timeOnlyCols = columns.filter(c => TIME_ONLY_RE.test(str(first(c))));
  // Horodatage : une colonne date qui porte déjà l'heure, sinon date seule + heure séparée
  const tsWithTime = dateCols.find(c => HAS_TIME_RE.test(str(first(c))) || first(c) instanceof Date);
  const timestampCol = tsWithTime ?? dateCols[0] ?? columns.find(c => /time|date|heure|horodat|timestamp/i.test(c)) ?? '';
  const timeCol = !tsWithTime && dateCols[0] ? (timeOnlyCols[0] ?? '') : '';

  const numericCols = columns.filter(c => {
    if (c === timestampCol || c === timeCol || INDEX_COL_RE.test(c.trim())) return false;
    const v = first(c);
    return typeof v === 'number' || (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim()));
  });
  const valueCol = numericCols[0] ?? '';
  const unit = valueCol ? (unitFromHeader(valueCol) || unitFromMeta(meta, valueCol)) : '';
  const metricLabel = valueCol ? labelFromHeader(valueCol) : '';

  const extraCols: ExtraCol[] = numericCols.slice(1).map(c => {
    const u = unitFromHeader(c);
    return { col: c, label: u ? `${labelFromHeader(c)} (${u})` : labelFromHeader(c) };
  });

  const metaName = Object.entries(meta).find(([k]) => /logging name|name|nom|point|location|site/i.test(k))?.[1];
  const name = (metaName ?? fileName.replace(/\.[^.]+$/, '')).trim();

  return { name, timestampCol, timeCol, valueCol, unit, metricLabel, extraCols };
}

/**
 * Même heuristique que le backend (`_infer_dayfirst`) : une composante > 12
 * tranche ; sinon celle qui change le plus souvent est le jour ; sinon null.
 */
export function inferDayFirst(samples: string[]): boolean | null {
  const pairs: [number, number][] = [];
  for (const v of samples) {
    const m = v.match(DATE_RE);
    if (!m) continue;
    if (m[1].length === 4) return null; // ISO
    pairs.push([Number(m[1]), Number(m[2])]);
  }
  if (pairs.length === 0) return null;
  if (pairs.some(([a]) => a > 12)) return true;
  if (pairs.some(([, b]) => b > 12)) return false;
  let ca = 0, cb = 0;
  for (let i = 1; i < pairs.length; i++) { if (pairs[i][0] !== pairs[i - 1][0]) ca++; if (pairs[i][1] !== pairs[i - 1][1]) cb++; }
  return ca > cb ? true : cb > ca ? false : null;
}

/** Interprète un horodatage texte comme le fera le backend (sans format explicite). */
export function parseTimestampLike(text: string, dayFirst: boolean): Date | null {
  const t = text.trim();
  const m = t.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const d = new Date(t); return isNaN(d.getTime()) ? null : d; }
  let y: number, mo: number, d: number;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (dayFirst) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else { mo = +m[1]; d = +m[2]; y = +m[3]; }
  if (y < 100) y += 2000;
  const date = new Date(y, mo - 1, d, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return isNaN(date.getTime()) || mo < 1 || mo > 12 || d < 1 || d > 31 ? null : date;
}

export interface TimestampPreview {
  dayFirst: boolean | null;
  first: Date | null;
  last: Date | null;
  /** Pas médian entre deux relevés, en secondes (null si < 2 relevés). */
  stepSeconds: number | null;
  invalid: number;
  total: number;
}

/**
 * Aperçu des dates telles qu'elles seront interprétées — c'est le seul moyen
 * sûr de lever l'ambiguïté 09-05-2026 = 5 septembre (US) ou 9 mai (FR).
 */
export function previewTimestamps(
  rows: Record<string, unknown>[],
  timestampCol: string,
  timeCol: string,
  forcedDayFirst?: boolean | null,
): TimestampPreview {
  const texts = rows.map(r => {
    const d = r[timestampCol]; const t = timeCol ? r[timeCol] : '';
    const ds = d instanceof Date ? d.toISOString() : String(d ?? '');
    return `${ds} ${t instanceof Date ? '' : String(t ?? '')}`.trim();
  }).filter(Boolean);
  const dayFirst = forcedDayFirst !== undefined && forcedDayFirst !== null ? forcedDayFirst : inferDayFirst(texts);
  const dates = texts.map(t => parseTimestampLike(t, dayFirst ?? true));
  const valid = dates.filter((d): d is Date => d !== null);
  const steps: number[] = [];
  for (let i = 1; i < valid.length; i++) steps.push(Math.abs(valid[i].getTime() - valid[i - 1].getTime()) / 1000);
  steps.sort((a, b) => a - b);
  return {
    dayFirst,
    first: valid[0] ?? null,
    last: valid[valid.length - 1] ?? null,
    stepSeconds: steps.length ? steps[Math.floor(steps.length / 2)] : null,
    invalid: texts.length - valid.length,
    total: texts.length,
  };
}
