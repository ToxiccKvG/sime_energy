import * as XLSX from 'xlsx';
import {
  BILLING_TEMPLATE_COLUMNS,
  BillingColumnDef,
  BillingColumnKey,
} from './billing-import.types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Champ SIMEE → index de la colonne source dans le fichier (null = ignoré). */
export type ColumnMapping = Partial<Record<BillingColumnKey, number | null>>;

/** Comment un champ a été associé automatiquement. */
export type MatchOrigin = Partial<Record<BillingColumnKey, 'exact' | 'alias'>>;

/** Interprétation des dates saisies en texte (les dates Excel natives ne sont pas concernées). */
export type DateFormat = 'auto' | 'DMY' | 'MDY';

export interface SourceColumn {
  index: number;
  /** Lettre Excel de la colonne (A, B, …, AA) */
  letter: string;
  /** En-tête tel qu'écrit dans le fichier ('' si la cellule d'en-tête est vide) */
  label: string;
  /** Premières valeurs non vides sous l'en-tête, brutes */
  samples: unknown[];
}

/** Sans ces champs, impossible de dater ou de dédoublonner une facture. */
export const MAPPING_BLOCKING_KEYS: BillingColumnKey[] = ['numeroFacture', 'dateDebutPeriode', 'dateFinPeriode'];

// ─── Normalisation des en-têtes ───────────────────────────────────────────────

const DIACRITICS = /[̀-ͯ]/g;
const NUMERO_SIGN = /\bn\s*[°º]\s*/g;
const NON_ALNUM = /[^a-z0-9]+/g;
const NUMERO_ABBREV = /\b(no|num|nro)\b/g;

/** « N° Facture », « numéro facture », « Num. facture » → « numero facture » */
export function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NUMERO_SIGN, ' numero ')
    .replace(NON_ALNUM, ' ')
    .replace(NUMERO_ABBREV, 'numero')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Synonymes ────────────────────────────────────────────────────────────────

/** Intitulés alternatifs rencontrés dans les exports clients (comparés après normalisation). */
const HEADER_ALIASES: Partial<Record<BillingColumnKey, string[]>> = {
  numeroCompteContrat: ['compte contrat', 'n° compte contrat', 'n° contrat', 'numero contrat', 'reference contrat', 'ref contrat'],
  partenaire: ['partenaire', 'client', 'nom client', 'raison sociale', 'abonne', 'nom abonne'],
  localite: ['ville', 'commune'],
  rue: ['adresse'],
  numeroFacture: ['n° facture', 'num facture', 'numero de facture', 'facture n°', 'ref facture', 'reference facture', 'facture'],
  dateComptableFacture: ['date facture', 'date de facture', 'date comptable', 'date emission', 'date d emission'],
  montantTotalEnergie: ['montant energie', 'total energie'],
  montantRedevance: ['redevance'],
  montantTCO: ['tco', 'taxe communale'],
  montantHorsTVA: ['montant ht', 'total ht', 'hors tva', 'ht'],
  montantTVA: ['tva'],
  montantFactureTTC: ['montant ttc', 'total ttc', 'ttc', 'net a payer', 'montant total'],
  dateDebutPeriode: ['date debut', 'debut periode', 'date debut periode', 'periode du', 'du'],
  dateFinPeriode: ['date fin', 'fin periode', 'date fin periode', 'periode au', 'au'],
  consommationFacturee: ['consommation', 'conso', 'consommation kwh', 'conso kwh', 'kwh factures', 'energie facturee'],
  nbJourFacturation: ['nb jours', 'nbre jours', 'nombre de jours', 'jours factures'],
  puissanceSouscrite: ['ps', 'puissance souscrite kw', 'puissance souscrite kva'],
  puissanceMaxRelevee: ['pmax', 'puissance max', 'puissance maximale', 'puissance atteinte'],
  montantPrimeFixe: ['prime fixe'],
  montantCosinusPhi: ['montant cos phi', 'penalite cos phi'],
  valeurCosinusPhi: ['cos phi', 'cosinus phi'],
  typeTarifNumero: ['tarif', 'code tarif', 'type tarif'],
  typeClientTexte: ['type client'],
  numeroCompteur: ['compteur', 'numero compteur'],
  appartenance: ['site', 'nom du site', 'batiment', 'entite'],
  consK1: ['conso k1', 'consommation k1'],
  consK2: ['conso k2', 'consommation k2'],
};

const NORMALIZED_LABELS = new Map<BillingColumnKey, string>(
  BILLING_TEMPLATE_COLUMNS.map(c => [c.key, normalizeHeader(c.label)]),
);

const NORMALIZED_ALIASES = new Map<BillingColumnKey, string[]>(
  Object.entries(HEADER_ALIASES).map(([k, list]) => [k as BillingColumnKey, list.map(normalizeHeader)]),
);

/** Tous les intitulés connus (labels + alias), pour repérer la ligne d'en-tête. */
const KNOWN_HEADERS = new Set<string>([
  ...NORMALIZED_LABELS.values(),
  ...[...NORMALIZED_ALIASES.values()].flat(),
]);

// ─── Lecture de la feuille ────────────────────────────────────────────────────

const HEADER_SCAN_ROWS = 10;
const SAMPLE_SCAN_ROWS = 200;
const SAMPLE_COUNT = 3;

function isEmptyCell(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

/** Parmi les premières lignes, retient celle qui ressemble le plus à une ligne d'en-tête (0-based). */
export function detectHeaderRow(rawRows: unknown[][]): number {
  let best = -1;
  let bestScore = 0;
  let firstTextRow = -1;
  const limit = Math.min(HEADER_SCAN_ROWS, rawRows.length);
  for (let i = 0; i < limit; i++) {
    const row = rawRows[i] ?? [];
    let score = 0;
    let textCells = 0;
    for (const cell of row) {
      if (typeof cell !== 'string' || !cell.trim()) continue;
      textCells++;
      if (KNOWN_HEADERS.has(normalizeHeader(cell))) score++;
    }
    if (score > bestScore) { best = i; bestScore = score; }
    if (firstTextRow < 0 && textCells >= 2) firstTextRow = i;
  }
  if (best >= 0) return best;
  return firstTextRow >= 0 ? firstTextRow : 0;
}

export function extractSourceColumns(rawRows: unknown[][], headerRow: number): SourceColumn[] {
  const header = rawRows[headerRow] ?? [];
  const dataRows = rawRows.slice(headerRow + 1, headerRow + 1 + SAMPLE_SCAN_ROWS);
  let width = header.length;
  for (const r of dataRows) if (r && r.length > width) width = r.length;

  const columns: SourceColumn[] = [];
  for (let index = 0; index < width; index++) {
    const label = isEmptyCell(header[index]) ? '' : String(header[index]).trim();
    const samples: unknown[] = [];
    for (const r of dataRows) {
      const v = r?.[index];
      if (!isEmptyCell(v)) samples.push(v);
      if (samples.length >= SAMPLE_COUNT) break;
    }
    if (!label && samples.length === 0) continue;
    columns.push({ index, letter: XLSX.utils.encode_col(index), label, samples });
  }
  return columns;
}

/** Nombre de lignes de données non vides sous l'en-tête. */
export function countDataRows(rawRows: unknown[][], headerRow: number): number {
  let n = 0;
  for (let i = headerRow + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (Array.isArray(r) && r.some(c => !isEmptyCell(c))) n++;
  }
  return n;
}

// ─── Association automatique ──────────────────────────────────────────────────

/**
 * Propose une colonne source pour chaque champ SIMEE.
 * 1. en-tête identique au libellé du template ; 2. synonyme exact ;
 * 3. en-tête qui contient un libellé/synonyme de 2 mots ou plus (le plus long gagne).
 * Une colonne source n'est proposée qu'une seule fois.
 */
export function autoMatch(columns: SourceColumn[]): { mapping: ColumnMapping; origin: MatchOrigin } {
  const mapping: ColumnMapping = {};
  const origin: MatchOrigin = {};
  const used = new Set<number>();
  const normalized = columns
    .filter(c => c.label)
    .map(c => ({ index: c.index, norm: normalizeHeader(c.label) }));

  const assign = (key: BillingColumnKey, index: number, how: 'exact' | 'alias') => {
    mapping[key] = index;
    origin[key] = how;
    used.add(index);
  };

  // Passe 1 — libellé exact
  for (const col of BILLING_TEMPLATE_COLUMNS) {
    const target = NORMALIZED_LABELS.get(col.key);
    const hit = normalized.find(s => !used.has(s.index) && s.norm === target);
    if (hit) assign(col.key, hit.index, 'exact');
  }

  // Passe 2 — synonyme exact
  for (const col of BILLING_TEMPLATE_COLUMNS) {
    if (mapping[col.key] != null) continue;
    const aliases = NORMALIZED_ALIASES.get(col.key);
    if (!aliases) continue;
    const hit = normalized.find(s => !used.has(s.index) && aliases.includes(s.norm));
    if (hit) assign(col.key, hit.index, 'alias');
  }

  // Passe 3 — l'en-tête contient un libellé ou synonyme d'au moins 2 mots
  const needles: { key: BillingColumnKey; needle: string }[] = [];
  for (const col of BILLING_TEMPLATE_COLUMNS) {
    const candidates = [NORMALIZED_LABELS.get(col.key) ?? '', ...(NORMALIZED_ALIASES.get(col.key) ?? [])];
    for (const needle of candidates) {
      if (needle.split(' ').length >= 2) needles.push({ key: col.key, needle });
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  for (const { key, needle } of needles) {
    if (mapping[key] != null) continue;
    const hit = normalized.find(s => !used.has(s.index) && ` ${s.norm} `.includes(` ${needle} `));
    if (hit) assign(key, hit.index, 'alias');
  }

  return { mapping, origin };
}

/** Vrai si les en-têtes reprennent le template SENELEC à l'identique, colonne par colonne. */
export function isStandardTemplate(rawRows: unknown[][], headerRow: number): boolean {
  const header = rawRows[headerRow] ?? [];
  return BILLING_TEMPLATE_COLUMNS.every((col, i) => normalizeHeader(header[i]) === NORMALIZED_LABELS.get(col.key));
}

// ─── Contrôle du mapping ──────────────────────────────────────────────────────

export interface MappingIssues {
  /** Champs indispensables non associés → import impossible */
  blocking: BillingColumnDef[];
  /** Champs requis non associés → lignes signalées incomplètes dans l'aperçu */
  missingRequired: BillingColumnDef[];
  /** Colonne source → champs qui la partagent (si plusieurs) */
  shared: Map<number, BillingColumnKey[]>;
  mappedCount: number;
}

export function getMappingIssues(mapping: ColumnMapping): MappingIssues {
  const blocking: BillingColumnDef[] = [];
  const missingRequired: BillingColumnDef[] = [];
  const byIndex = new Map<number, BillingColumnKey[]>();
  let mappedCount = 0;

  for (const col of BILLING_TEMPLATE_COLUMNS) {
    const idx = mapping[col.key];
    if (idx != null) {
      mappedCount++;
      const list = byIndex.get(idx);
      if (list) list.push(col.key); else byIndex.set(idx, [col.key]);
      continue;
    }
    if (MAPPING_BLOCKING_KEYS.includes(col.key)) blocking.push(col);
    else if (col.required && !col.computed) missingRequired.push(col);
  }

  const shared = new Map<number, BillingColumnKey[]>();
  for (const [idx, keys] of byIndex) if (keys.length > 1) shared.set(idx, keys);

  return { blocking, missingRequired, shared, mappedCount };
}

// ─── Conversion des cellules ──────────────────────────────────────────────────

const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function makeDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

export function parseExcelDate(value: unknown, dateFormat: DateFormat = 'auto'): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Date sérielle Excel → Date JS
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const slash = s.match(SLASH_DATE);
    if (slash) {
      const a = +slash[1], b = +slash[2], y = +slash[3];
      if (dateFormat === 'MDY') return makeDate(y, a, b);
      if (dateFormat === 'DMY') return makeDate(y, b, a);
      // auto : JJ/MM, sauf si le 2e nombre ne peut pas être un mois
      return b > 12 && a <= 12 ? makeDate(y, a, b) : makeDate(y, b, a);
    }
    const iso = s.match(ISO_DATE);
    if (iso) return makeDate(+iso[1], +iso[2], +iso[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Convertit une cellule brute selon le type du champ cible.
 * `skipped` = la cellule vaut « - » (non applicable) ; `invalid` = valeur présente mais illisible.
 */
export function coerceCell(
  raw: unknown,
  type: BillingColumnDef['type'],
  dateFormat: DateFormat,
): { value: unknown; skipped: boolean; invalid: boolean } {
  const rawStr = raw == null ? '' : String(raw).trim();
  if (rawStr === '-') return { value: null, skipped: true, invalid: false };
  if (rawStr === '') return { value: null, skipped: false, invalid: false };
  // Formule non évaluée → ignorée
  if (typeof raw === 'string' && raw.startsWith('=')) return { value: null, skipped: false, invalid: false };

  if (type === 'date') {
    const d = parseExcelDate(raw, dateFormat);
    return { value: d, skipped: false, invalid: d == null };
  }
  if (type === 'number') {
    const n = parseFloat(String(raw));
    return { value: isNaN(n) ? null : n, skipped: false, invalid: isNaN(n) };
  }
  return { value: rawStr, skipped: false, invalid: false };
}
