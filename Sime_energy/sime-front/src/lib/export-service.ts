import * as XLSX from 'xlsx';
import { AuditInvoice } from './invoice-service';
import { SENELEC_DICTIONARY } from '@/types/annotation-dictionary';
import { mapOcrToInvoiceData } from '@/lib/invoice-mapper';

// ─── Key normalisation (same logic as annotation service) ────────────────────

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s*:\s*$/, '')
    .replace(/[°º()[\],.%²¹³'"`/]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the human-readable dict field key if the raw key matches, else the raw key. */
function toDictKey(rawKey: string): string {
  const nk = normalizeKey(rawKey);
  for (const field of SENELEC_DICTIONARY.fields) {
    if (normalizeKey(field.key) === nk) return field.key;
    if ((field.aliases ?? []).some((a) => normalizeKey(a) === nk)) return field.key;
  }
  return rawKey;
}

// ─── OCR extraction ──────────────────────────────────────────────────────────

/**
 * Extrait les lignes de tableaux OCR bruts comme paires clé→valeur.
 * Gère 3 cas courants sur les factures SENELEC :
 *   1. 2 cellules exactement : [label, valeur]
 *   2. 3 cellules dont une vide (colonne vide centrale) : [label, "", valeur]
 *   3. N cellules dont les 2 premières non vides forment la paire
 * Les cellules "None" (artefact Python json.dumps) sont traitées comme vides.
 */
function extractTableKV(rawTables: unknown[]): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];

  const cellText = (c: unknown): string => {
    if (!c || typeof c !== 'object') return '';
    const t = String((c as Record<string, unknown>).text ?? '').trim();
    // "None" is the Python str(None) artefact — treat as empty
    return t === 'None' ? '' : t;
  };

  for (const tbl of rawTables) {
    if (!tbl || typeof tbl !== 'object') continue;
    const tblObj = tbl as Record<string, unknown>;
    if (!Array.isArray(tblObj.rows)) continue;

    for (const row of tblObj.rows as unknown[][]) {
      if (!Array.isArray(row)) continue;

      // All cell texts (preserving empty positions)
      const allCells = row.map(cellText);
      // Non-empty cells only
      const nonEmpty = allCells.filter(Boolean);

      if (nonEmpty.length < 2) continue;

      // Case 1 & 2 : first non-empty = key, last non-empty = value
      // (handles [label, value], [label, "", value], [label, value, ""], ["", label, value])
      const key   = nonEmpty[0];
      const value = nonEmpty[nonEmpty.length - 1];

      // Sanity guard: skip if key === value (merged header row)
      if (key && value && key !== value) {
        pairs.push({ key, value });
      }
    }
  }
  return pairs;
}

/** Résout les tables brutes depuis un objet ocr_data (page/pages/flat). */
function resolveRawTables(ocr: Record<string, unknown>): unknown[] {
  type PageEntry = { tables?: unknown[] };
  const pageArr = Array.isArray(ocr.pages)
    ? (ocr.pages as PageEntry[])
    : Array.isArray(ocr.page)
      ? (ocr.page as PageEntry[])
      : null;
  if (pageArr && pageArr[0] && Array.isArray(pageArr[0].tables)) return pageArr[0].tables!;
  if (Array.isArray(ocr.tables)) return ocr.tables as unknown[];
  return [];
}

/**
 * Extracts key→value pairs from an invoice.
 * Priority: ocr_data_verified.unifiedData > raw ocr_data forms.
 * Complète ensuite avec les lignes 2-colonnes des tables brutes (dans les deux cas).
 * Recognized raw keys are normalized to their dict field key (deduplicates aliases).
 */
function extractOCRFields(invoice: AuditInvoice): Record<string, string> {
  const raw: Record<string, string> = {};

  // Priority 1: ocr_data_verified.unifiedData (LLM-merged forms + tables)
  if (invoice.ocr_data_verified && typeof invoice.ocr_data_verified === 'object') {
    const verified = invoice.ocr_data_verified as Record<string, unknown>;
    if (verified.unifiedData && typeof verified.unifiedData === 'object') {
      Object.entries(verified.unifiedData as Record<string, unknown>).forEach(([key, value]) => {
        if (key && value != null) raw[key] = String(value);
      });
    }
  }

  // Priority 2 (or sole source): raw Textract data (forms + 2-column table rows)
  if (invoice.ocr_data) {
    const ocr = invoice.ocr_data as Record<string, unknown>;

    type PageEntry = { forms?: Array<{ Key: string; Value: unknown }>; tables?: unknown[] };
    const pageArr = Array.isArray(ocr.pages)
      ? (ocr.pages as PageEntry[])
      : Array.isArray(ocr.page)
        ? (ocr.page as PageEntry[])
        : null;

    let forms: Array<{ Key: string; Value: unknown }> = [];
    if (pageArr && pageArr[0] && Array.isArray(pageArr[0].forms)) forms = pageArr[0].forms!;
    else if (Array.isArray(ocr.forms)) forms = ocr.forms as Array<{ Key: string; Value: unknown }>;

    // Forms — only if unifiedData didn't supply anything
    if (Object.keys(raw).length === 0) {
      forms.forEach((form) => {
        if (form.Key && form.Value != null) raw[form.Key] = String(form.Value);
      });
    }

    // 2-column table rows — complement unifiedData/forms (do not overwrite)
    const rawTables = resolveRawTables(ocr);
    for (const { key, value } of extractTableKV(rawTables)) {
      if (!raw[key]) raw[key] = value;
    }
  }

  // Normalize recognized raw keys → dict field keys (deduplicates aliases)
  const normalized: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    const dictKey = toDictKey(rawKey);
    if (!normalized[dictKey]) normalized[dictKey] = value; // keep first seen value
  }
  return normalized;
}

// ─── Column ordering ─────────────────────────────────────────────────────────

/**
 * Orders columns: SENELEC required fields first, then optional recognized, then raw alphabetically.
 */
function getColumnOrder(allFields: Set<string>): string[] {
  const required = SENELEC_DICTIONARY.fields.filter((f) => f.required).map((f) => f.key);
  const optional = SENELEC_DICTIONARY.fields.filter((f) => !f.required).map((f) => f.key);

  const ordered: string[] = [];
  const remaining = new Set(allFields);

  for (const key of [...required, ...optional]) {
    if (remaining.has(key)) {
      ordered.push(key);
      remaining.delete(key);
    }
  }

  // Remaining (unrecognized raw keys) sorted alphabetically
  ordered.push(...Array.from(remaining).sort());
  return ordered;
}

// ─── Métriques calculées (tranches + indicateurs) ─────────────────────────────

/**
 * Extrait depuis mapOcrToInvoiceData les champs calculés non présents dans les forms :
 * tranches kWh/tarif/montant, IPR, K2%, Pmax, cosφ, NJ
 * Ces colonnes sont toujours ajoutées à la fin de l'export (section "Données calculées").
 */
export const COMPUTED_COLUMNS = [
  'Conso totale kWh',
  'K1 kWh (hors pointe)',
  'K2 kWh (pointe)',
  'K2 %',
  'Pmax kW',
  'Cosφ mesuré',
  'MTTC FCFA (calculé)',
  'IPR FCFA/kWh',
  'NJ (jours)',
  'T1 kWh',
  'T1 Tarif FCFA/kWh',
  'T1 Montant FCFA',
  'T2 kWh',
  'T2 Tarif FCFA/kWh',
  'T2 Montant FCFA',
  'T3 kWh',
  'T3 Tarif FCFA/kWh',
  'T3 Montant FCFA',
] as const;

function extractComputedFields(invoice: AuditInvoice): Record<string, string> {
  // Always use raw ocr_data — ocr_data_verified has {unifiedData} structure that
  // mapOcrToInvoiceData cannot parse (it expects {page/pages/forms} arrays).
  const d = mapOcrToInvoiceData(
    invoice.ocr_data,
    invoice.amount ?? undefined,
  );

  const fmt = (n: number | undefined, decimals = 0) =>
    n != null && n > 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '';

  const k2pct = d.conso_k2_kwh && d.conso_kwh_total && d.conso_kwh_total > 0
    ? ((d.conso_k2_kwh / d.conso_kwh_total) * 100)
    : undefined;

  const ipr = d.montant_ttc && d.conso_kwh_total && d.conso_kwh_total > 0
    ? d.montant_ttc / d.conso_kwh_total
    : undefined;

  return {
    'Conso totale kWh':    fmt(d.conso_kwh_total),
    'K1 kWh (hors pointe)': fmt(d.conso_k1_kwh),
    'K2 kWh (pointe)':     fmt(d.conso_k2_kwh),
    'K2 %':                k2pct != null ? k2pct.toFixed(1) : '',
    'Pmax kW':             fmt(d.puissance_max_kw, 1),
    'Cosφ mesuré':         d.cosphi_mesure != null ? d.cosphi_mesure.toFixed(3) : '',
    'MTTC FCFA (calculé)': fmt(d.montant_ttc),
    'IPR FCFA/kWh':        ipr != null ? ipr.toFixed(2) : '',
    'NJ (jours)':          d.periode_jours_ocr ? String(d.periode_jours_ocr) : '',
    'T1 kWh':              fmt(d.tranche1_kwh),
    'T1 Tarif FCFA/kWh':   d.tranche1_tarif != null && d.tranche1_tarif > 0 ? d.tranche1_tarif.toFixed(2) : '',
    'T1 Montant FCFA':     fmt(d.tranche1_montant),
    'T2 kWh':              fmt(d.tranche2_kwh),
    'T2 Tarif FCFA/kWh':   d.tranche2_tarif != null && d.tranche2_tarif > 0 ? d.tranche2_tarif.toFixed(2) : '',
    'T2 Montant FCFA':     fmt(d.tranche2_montant),
    'T3 kWh':              fmt(d.tranche3_kwh),
    'T3 Tarif FCFA/kWh':   d.tranche3_tarif != null && d.tranche3_tarif > 0 ? d.tranche3_tarif.toFixed(2) : '',
    'T3 Montant FCFA':     fmt(d.tranche3_montant),
  };
}

// ─── Date extraction ─────────────────────────────────────────────────────────

function getInvoiceDate(invoice: AuditInvoice): Date {
  const fields = extractOCRFields(invoice);

  // Try dict field keys first, then raw fallbacks
  const dateString =
    fields['Date de facturation'] ||
    fields['Période du'] ||
    fields['DATE_COMPTABLE_FACTURE'] ||
    fields['DATE'];

  if (dateString) {
    try {
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) return d;
    } catch {
      // fall through
    }
  }

  if (invoice.invoice_date) {
    try {
      const d = new Date(invoice.invoice_date);
      if (!isNaN(d.getTime())) return d;
    } catch {
      // fall through
    }
  }

  return new Date(invoice.created_at);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Exporte les factures vérifiées en Excel
 * - selectedIds : si fourni, n'exporte que ces factures (parmi les vérifiées)
 * - orderedFields : colonnes à inclure, dans l'ordre souhaité (tableau = ordre utilisateur)
 *                   Si non fourni, toutes les colonnes sont incluses dans l'ordre par défaut.
 */
export async function exportVerifiedInvoicesToExcel(
  invoices: AuditInvoice[],
  selectedIds?: Set<string>,
  orderedFields?: string[],
): Promise<void> {
  let verifiedInvoices = invoices.filter((inv) => inv.status === 'verified');

  if (selectedIds && selectedIds.size > 0) {
    verifiedInvoices = verifiedInvoices.filter((inv) => selectedIds.has(inv.id));
  }

  if (verifiedInvoices.length === 0) {
    throw new Error('Aucune facture vérifiée à exporter');
  }

  // Sort oldest first
  const sortedInvoices = [...verifiedInvoices].sort(
    (a, b) => getInvoiceDate(a).getTime() - getInvoiceDate(b).getTime(),
  );

  // Collect all unique field keys (normalized to dict keys where recognized)
  const allFields = new Set<string>();
  sortedInvoices.forEach((invoice) => {
    Object.keys(extractOCRFields(invoice)).forEach((k) => allFields.add(k));
  });

  // Build column list: FILE_NAME + DATE always first, then OCR fields, then computed
  const computedSet = new Set<string>(COMPUTED_COLUMNS);
  let finalColumns: string[];
  if (orderedFields && orderedFields.length > 0) {
    // User-defined order: respect it exactly.
    // OCR fields must exist in the data; computed columns are accepted if the user selected them.
    const existing = new Set(allFields);
    const ocrPart      = orderedFields.filter((f) => existing.has(f) && !computedSet.has(f));
    const computedPart = orderedFields.filter((f) => computedSet.has(f));
    finalColumns = ['FILE_NAME', 'DATE', ...ocrPart, ...computedPart];
  } else {
    // Default order: auto-sort by dict priority then all computed columns
    const autoOrder = getColumnOrder(allFields);
    finalColumns = ['FILE_NAME', 'DATE', ...autoOrder, ...COMPUTED_COLUMNS];
  }

  // Build rows
  const rows: Record<string, string>[] = sortedInvoices.map((invoice) => {
    const row: Record<string, string> = {
      FILE_NAME: invoice.file_name,
      DATE: getInvoiceDate(invoice).toLocaleDateString('fr-FR'),
    };
    // OCR fields (forms)
    Object.entries(extractOCRFields(invoice)).forEach(([key, value]) => {
      row[key] = value;
    });
    // Computed fields (tranches tableau + indicateurs)
    Object.entries(extractComputedFields(invoice)).forEach(([key, value]) => {
      row[key] = value;
    });
    return row;
  });

  // Write Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: finalColumns });
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Factures');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Factures-verifiees-${dateStr}.xlsx`);
}
