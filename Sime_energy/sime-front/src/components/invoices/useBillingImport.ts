import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BILLING_TEMPLATE_COLUMNS,
  MOIS_FR,
  TARIF_CODES,
  BillingRow,
  BillingImportResult,
  CategorieTarifaire,
} from './billing-import.types';
import {
  getTariffGrid,
  getAvailableTariffYears,
  getTransfoCoefficients,
  TCO_RATE_BT,
  TariffGrid,
} from '@/constants/senelec-tariffs';

const CHUNK_SIZE = 200;

// ─── Helpers grille tarifaire ──────────────────────────────────────────────────

/** Grille effective pour une année de facture : prend la dernière grille disponible ≤ annee. */
function getActiveTariffYear(invoiceYear: number): number {
  const years = getAvailableTariffYears();
  let best = years[0];
  for (const y of years) { if (y <= invoiceYear) best = y; }
  return best;
}

type TariffRates = { k1: number | null; k2: number | null; pf: number | null; domain: 'BT' | 'MT' | 'HT' | null };

/** Recherche les taux k1/k2/pf + domaine pour un code tarif et une année. */
function lookupTariffRates(typeTarif: string | null, invoiceYear: number | null): TariffRates {
  const none: TariffRates = { k1: null, k2: null, pf: null, domain: null };
  if (!typeTarif || !invoiceYear) return none;
  const year = getActiveTariffYear(invoiceYear);
  const grid = getTariffGrid(year);
  if (!grid) return none;
  const code = typeTarif.toUpperCase() as string;
  for (const [dom, cats] of [['BT', grid.BT], ['MT', grid.MT], ['HT', grid.HT]] as const) {
    if (code in cats) {
      const r = (cats as Record<string, TariffGrid['BT'][keyof TariffGrid['BT']]>)[code];
      return { k1: r.k1, k2: r.k2, pf: r.pf, domain: dom };
    }
  }
  return none;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

function parseExcelDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date → JS Date
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    // Try DD/MM/YYYY
    const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) return new Date(+ddmm[3], +ddmm[2] - 1, +ddmm[1]);
    // Try YYYY-MM-DD
    const yymm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yymm) return new Date(+yymm[1], +yymm[2] - 1, +yymm[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─── Auto-fix engine ──────────────────────────────────────────────────────────

/** Taux de TVA standard SENELEC (18%). */
export const TVA_RATE = 0.18;

function autoFixRow(row: BillingRow): BillingRow {
  const r = { ...row };
  const before: Record<string, unknown> = { ...r };

  // ── NIVEAU 1 — Index & consommations ────────────────────────────────────────

  // Nombre de jours depuis les dates de période
  if (r.nbJourFacturation == null && r.dateDebutPeriode && r.dateFinPeriode) {
    const d = Math.round((r.dateFinPeriode.getTime() - r.dateDebutPeriode.getTime()) / 86400000);
    if (d > 0) r.nbJourFacturation = d;
  }

  // Consommations K1/K2 depuis les index (priorité aux index K1/K2 dédiés)
  const rawK1 = r.nouvelIndexK1 != null && r.ancienIndexK1 != null ? r.nouvelIndexK1 - r.ancienIndexK1 : null;
  const rawK2 = r.nouvelIndexK2 != null && r.ancienIndexK2 != null ? r.nouvelIndexK2 - r.ancienIndexK2 : null;
  if (r.consK1 == null && rawK1 != null && rawK1 >= 0) r.consK1 = rawK1;
  if (r.consK2 == null && rawK2 != null && rawK2 >= 0) r.consK2 = rawK2;

  // consT (Wa) depuis K1+K2
  if (r.consT == null && r.consK1 != null && r.consK2 != null) r.consT = r.consK1 + r.consK2;

  // consommationFacturee depuis index général CG
  if (r.consommationFacturee == null && r.niCG != null && r.aiCG != null) {
    const d = r.niCG - r.aiCG;
    if (d >= 0) r.consommationFacturee = d;
  }
  // consommationFacturee depuis K1/K2
  if (r.consommationFacturee == null) {
    if (r.consK1 != null && r.consK2 != null) r.consommationFacturee = r.consK1 + r.consK2;
    else if (r.consK1 != null) r.consommationFacturee = r.consK1;
  }

  // consT depuis consommationFacturee si toujours null
  if (r.consT == null && r.consommationFacturee != null) r.consT = r.consommationFacturee;

  // Fallback K1/K2 = 90 % / 10 % de Wa si les index ne sont pas disponibles
  if (r.consT != null) {
    if (r.consK1 == null) r.consK1 = Math.round(r.consT * 0.9);
    if (r.consK2 == null) r.consK2 = Math.round(r.consT * 0.1);
  }

  // Consommation réactive Wr depuis index réactifs
  if (r.consWr == null && r.nouvelIndexReactif != null && r.ancienIndexReactif != null) {
    const wr = r.nouvelIndexReactif - r.ancienIndexReactif;
    if (wr >= 0) r.consWr = wr;
  }

  // ── NIVEAU 2 — Grille tarifaire ─────────────────────────────────────────────

  // S'assurer que computeDerived a déjà résolu anneeFacturation et typeTarifNumero
  computeDerived(r);

  const tarif = lookupTariffRates(r.typeTarifNumero, r.anneeFacturation);

  // ── NIVEAU 3 — Pertes transformateur (Ma, Mr, MaHP, MaEP) ───────────────────

  let ma: number | null = null;
  let mr: number | null = null;

  const transfoKva = r.puissanceTransfo;
  const h1 = r.heureH1;
  const h2 = r.heureH2;

  if (transfoKva != null && h1 != null && r.consT != null) {
    const coeffs = getTransfoCoefficients(transfoKva);
    if (coeffs) {
      // Ma = αa × Wa + βa × H1
      ma = coeffs.alphaA * r.consT + coeffs.betaA * h1;
      // Mr = αr × Wr + βr × (H1 − H2)
      if (r.consWr != null) {
        mr = coeffs.alphaR * r.consWr + coeffs.betaR * (h1 - (h2 ?? 0));
      }
      // Répartition des majorations sur K1/K2
      const wa = r.consT;
      if (wa > 0 && r.consK1 != null && r.consK2 != null) {
        if (r.majorationK1 == null) r.majorationK1 = Math.round(ma * r.consK1 / wa);
        if (r.majorationK2 == null) r.majorationK2 = Math.round(ma * r.consK2 / wa);
      }
    }
  }

  // ── NIVEAU 4 — Cosinus φ ────────────────────────────────────────────────────

  if (r.valeurCosinusPhi == null && r.consT != null) {
    const a = r.consT + (ma ?? 0);               // énergie active totale
    const rr = (r.consWr ?? 0) + (mr ?? 0);      // énergie réactive totale
    if (a > 0 || rr > 0) {
      r.valeurCosinusPhi = Math.round((a / Math.sqrt(a * a + rr * rr)) * 10000) / 10000;
    }
  }

  // ── NIVEAU 5 — Montants énergie depuis grille ────────────────────────────────

  if (tarif.k1 != null && tarif.k2 != null && r.consK1 != null && r.consK2 != null) {
    const effK1 = r.consK1 + (r.majorationK1 ?? 0);
    const effK2 = r.consK2 + (r.majorationK2 ?? 0);
    if (r.montantEnergieK1 == null) r.montantEnergieK1 = Math.round(tarif.k1 * effK1);
    if (r.montantEnergieK2 == null) r.montantEnergieK2 = Math.round(tarif.k2 * effK2);
  }
  // montantTotalEnergie = K1 + K2 (si les deux calculés)
  if (r.montantTotalEnergie == null && r.montantEnergieK1 != null && r.montantEnergieK2 != null) {
    r.montantTotalEnergie = r.montantEnergieK1 + r.montantEnergieK2;
  }

  // ── NIVEAU 6 — Prime fixe & pénalités ────────────────────────────────────────

  if (tarif.pf != null && r.nbJourFacturation != null && r.puissanceSouscriteKW != null) {
    // Tpf_mensuel = (NJ / 365) × Tpf_annuel = (NJ / 365) × pf × 12
    const tpfMensuel = tarif.pf * r.nbJourFacturation * 12 / 365;
    if (r.montantPrimeFixe == null) r.montantPrimeFixe = Math.round(tpfMensuel * r.puissanceSouscriteKW);
    // PDP = 1.5 × Tpf_mensuel × (Pmax − Ps)  si Pmax > Ps
    if (r.penalitesDepassement == null && r.puissanceMaxKW != null && r.puissanceMaxKW > r.puissanceSouscriteKW) {
      r.penalitesDepassement = Math.round(1.5 * tpfMensuel * (r.puissanceMaxKW - r.puissanceSouscriteKW));
    }
  }
  // Pénalités depuis PF déjà connu (si grille absente mais PF présent)
  if (r.penalitesDepassement == null && r.montantPrimeFixe != null && r.nbJourFacturation != null
    && r.puissanceSouscriteKW != null && r.puissanceMaxKW != null && r.puissanceMaxKW > r.puissanceSouscriteKW) {
    const tpfMensuel = r.montantPrimeFixe / r.puissanceSouscriteKW;
    r.penalitesDepassement = Math.round(1.5 * tpfMensuel * (r.puissanceMaxKW - r.puissanceSouscriteKW));
  }

  // ── NIVEAU 7 — TCO (2,5 % — BT uniquement) ───────────────────────────────────

  if (r.montantTCO == null && tarif.domain === 'BT' && r.montantTotalEnergie != null) {
    const baseTco = r.montantTotalEnergie
      + (r.montantPrimeFixe ?? 0)
      + (r.penalitesDepassement ?? 0)
      + (r.montantCosinusPhi ?? 0);
    r.montantTCO = Math.round(TCO_RATE_BT * baseTco);
  }

  // ── NIVEAU 8 — Reconstruction HT depuis composantes ──────────────────────────

  if (r.montantHorsTVA == null && r.montantTotalEnergie != null) {
    r.montantHorsTVA = Math.round(
      r.montantTotalEnergie
      + (r.montantPrimeFixe ?? 0)
      + (r.penalitesDepassement ?? 0)
      + (r.montantCosinusPhi ?? 0)
      + (r.montantTCO ?? 0)
      + (r.montantRedevance ?? 0),
    );
  }

  // ── NIVEAU 9 — Triangle TVA (existant, complété) ─────────────────────────────

  if (r.montantTVA == null && r.montantFactureTTC != null && r.montantHorsTVA != null)
    r.montantTVA = Math.round(r.montantFactureTTC - r.montantHorsTVA);
  if (r.montantTVA == null && r.montantHorsTVA != null)
    r.montantTVA = Math.round(r.montantHorsTVA * TVA_RATE);
  if (r.montantHorsTVA == null && r.montantFactureTTC != null && r.montantTVA != null)
    r.montantHorsTVA = Math.round(r.montantFactureTTC - r.montantTVA);
  if (r.montantHorsTVA == null && r.montantTVA == null && r.montantFactureTTC != null) {
    r.montantHorsTVA = Math.round(r.montantFactureTTC / (1 + TVA_RATE));
    r.montantTVA = Math.round(r.montantFactureTTC - r.montantHorsTVA);
  }
  if (r.montantHorsTVA == null && r.montantTVA != null)
    r.montantHorsTVA = Math.round(r.montantTVA / TVA_RATE);
  if (r.montantFactureTTC == null && r.montantHorsTVA != null && r.montantTVA != null)
    r.montantFactureTTC = Math.round(r.montantHorsTVA + r.montantTVA);

  // montantTotalEnergie fallback HT si aucun détail disponible
  if (r.montantTotalEnergie == null && r.montantHorsTVA != null && r.montantRedevance == null && r.montantTCO == null)
    r.montantTotalEnergie = r.montantHorsTVA;

  // ── Finalisation ────────────────────────────────────────────────────────────
  computeDerived(r);
  validateRow(r);

  const repaired = new Set(row._repairedFields ?? []);
  for (const col of BILLING_TEMPLATE_COLUMNS) {
    const k = col.key as keyof BillingRow;
    const wasEmpty = before[col.key] == null || before[col.key] === '';
    const nowFilled = r[k] != null && r[k] !== '';
    if (wasEmpty && nowFilled) repaired.add(col.key);
  }
  r._repairedFields = [...repaired];
  return r;
}

export function countFixable(rows: BillingRow[]): number {
  return rows.filter(row => {
    if (row.rowErrors.length === 0) return false;
    return autoFixRow(row).rowErrors.length < row.rowErrors.length;
  }).length;
}

// ─── Détection d'anomalies (cohérence intrinsèque d'une facture) ───────────────

export interface RowAnomaly {
  count: number;
  reasons: string[];
}

/**
 * Détecte les incohérences « dures » d'une facture (identités comptables violées,
 * valeurs négatives, index en régression…). Sert à départager les doublons :
 * SENELEC garde le même n° facture quand elle redresse une facture erronée — la
 * version cohérente est conservée, la version anomalique est écartée.
 */
export function detectAnomalies(row: BillingRow): RowAnomaly {
  const reasons: string[] = [];
  if (row.rowErrors.length > 0) reasons.push(`${row.rowErrors.length} champ(s) requis manquant(s)`);

  const ttc = row.montantFactureTTC, ht = row.montantHorsTVA, tva = row.montantTVA;
  // Identité comptable TTC = HT + TVA (tolérance 1 FCFA pour arrondis)
  if (ttc != null && ht != null && tva != null && Math.abs(ttc - (ht + tva)) > 1)
    reasons.push('TTC ≠ HT + TVA');
  if (ttc != null && ttc < 0) reasons.push('Montant TTC négatif');
  if (ht != null && ht < 0) reasons.push('Montant HT négatif');
  if (tva != null && tva < 0) reasons.push('Montant TVA négatif');
  if (row.consommationFacturee != null && row.consommationFacturee < 0) reasons.push('Consommation négative');
  if (row.nbJourFacturation != null && row.nbJourFacturation <= 0) reasons.push('Nb jours ≤ 0');
  if (row.nouvelIndexK1 != null && row.ancienIndexK1 != null && row.nouvelIndexK1 < row.ancienIndexK1)
    reasons.push('Index K1 en régression');
  if (row.nouvelIndexK2 != null && row.ancienIndexK2 != null && row.nouvelIndexK2 < row.ancienIndexK2)
    reasons.push('Index K2 en régression');

  return { count: reasons.length, reasons };
}

// ─── Doublons & redressements (clé : numéro de facture) ────────────────────────

export interface DuplicateAnalysis {
  /** _rowIndex à écarter → _rowIndex conservé (le plus cohérent du groupe) */
  dropped: Map<number, number>;
  /** _rowIndex conservés correspondant à une version redressée (un doublon anomalique a été écarté) */
  redressed: Set<number>;
  /** _rowIndex écartés présentant des anomalies (factures incohérentes) */
  anomalous: Set<number>;
}

/**
 * Regroupe les lignes par numéro de facture. Pour chaque groupe en double, conserve
 * la ligne la plus cohérente (anomalies mini ; égalité → date comptable la plus
 * récente = le redressement ; sinon première occurrence) et écarte les autres.
 */
export function analyzeDuplicates(rows: BillingRow[]): DuplicateAnalysis {
  const groups = new Map<number, BillingRow[]>();
  for (const r of rows) {
    if (r.numeroFacture == null) continue;
    const g = groups.get(r.numeroFacture);
    if (g) g.push(r); else groups.set(r.numeroFacture, [r]);
  }

  const dropped = new Map<number, number>();
  const redressed = new Set<number>();
  const anomalous = new Set<number>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const scored = group.map(r => ({ r, a: detectAnomalies(r) }));
    const best = scored.reduce((acc, cur) => {
      if (cur.a.count !== acc.a.count) return cur.a.count < acc.a.count ? cur : acc;
      const cd = cur.r.dateComptableFacture?.getTime() ?? -Infinity;
      const bd = acc.r.dateComptableFacture?.getTime() ?? -Infinity;
      if (cd !== bd) return cd > bd ? cur : acc;
      return cur.r._rowIndex < acc.r._rowIndex ? cur : acc;
    });
    const keptIdx = best.r._rowIndex;
    const worstAnomaly = Math.max(...scored.map(s => s.a.count));

    for (const { r, a } of scored) {
      if (r._rowIndex === keptIdx) continue;
      dropped.set(r._rowIndex, keptIdx);
      if (a.count > 0) anomalous.add(r._rowIndex);
    }
    // La ligne conservée est « redressée » si elle est strictement plus cohérente
    // qu'au moins un doublon écarté (sinon c'est un simple doublon identique).
    if (best.a.count < worstAnomaly) redressed.add(keptIdx);
  }

  return { dropped, redressed, anomalous };
}

export function countDuplicates(rows: BillingRow[]): number {
  return analyzeDuplicates(rows).dropped.size;
}

// ─── Computed columns ─────────────────────────────────────────────────────────

function normalizeKW(watts: number | null): number | null {
  if (watts == null) return null;
  return watts >= 900 ? watts / 1000 : watts;
}

function resolveCategorie(code: string | null): CategorieTarifaire {
  if (!code) return null;
  const upper = code.toUpperCase();
  if ((TARIF_CODES.PETITE_PUISSANCE_BT as readonly string[]).includes(upper)) return 'Petite Puissance BT';
  if ((TARIF_CODES.GRANDE_PUISSANCE_BT as readonly string[]).includes(upper)) return 'Grande Puissance BT';
  if ((TARIF_CODES.GRANDE_PUISSANCE_MT as readonly string[]).includes(upper)) return 'Grande Puissance MT';
  return null;
}

function computeDerived(row: BillingRow): void {
  if (row.puissanceSouscriteKW == null)
    row.puissanceSouscriteKW = normalizeKW(row.puissanceSouscrite);
  if (row.puissanceMaxKW == null)
    row.puissanceMaxKW = normalizeKW(row.puissanceMaxRelevee);
  if (!row.categorieTarifaire)
    row.categorieTarifaire = resolveCategorie(row.typeTarifNumero);
  if (row.anneeFacturation == null && row.dateDebutPeriode)
    row.anneeFacturation = row.dateDebutPeriode.getFullYear();
  if (!row.moisFacturation && row.dateDebutPeriode)
    row.moisFacturation = MOIS_FR[row.dateDebutPeriode.getMonth()];

  // Colonnes calculées consommation — toujours dérivées si les index sont présents
  if (row.consK1 == null && row.nouvelIndexK1 != null && row.ancienIndexK1 != null) {
    const v = row.nouvelIndexK1 - row.ancienIndexK1;
    if (v >= 0) row.consK1 = v;
  }
  if (row.consK2 == null && row.nouvelIndexK2 != null && row.ancienIndexK2 != null) {
    const v = row.nouvelIndexK2 - row.ancienIndexK2;
    if (v >= 0) row.consK2 = v;
  }
  if (row.consT == null && row.consK1 != null && row.consK2 != null)
    row.consT = row.consK1 + row.consK2;
  if (row.consT == null && row.consommationFacturee != null)
    row.consT = row.consommationFacturee;
  if (row.consWr == null && row.nouvelIndexReactif != null && row.ancienIndexReactif != null) {
    const v = row.nouvelIndexReactif - row.ancienIndexReactif;
    if (v >= 0) row.consWr = v;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateRow(row: BillingRow): void {
  const errors: string[] = [];
  const skipped = row._skippedFields ?? [];
  for (const col of BILLING_TEMPLATE_COLUMNS) {
    if (!col.required) continue;
    if (skipped.includes(col.key)) continue; // "-" = intentionally not applicable
    const v = row[col.key as keyof BillingRow];
    if (v == null || v === '') errors.push(col.label);
  }
  row.rowErrors = errors;
}

// ─── Parse a raw Excel row into BillingRow ────────────────────────────────────

function parseRow(rawValues: unknown[], rowIndex: number): BillingRow {
  const row: BillingRow = {
    _rowIndex: rowIndex,
    rowErrors: [],
    _skippedFields: [],
    _repairedFields: [],
    numeroCompteContrat: null, partenaire: null, localite: null, arrondissement: null, rue: null,
    numeroFacture: null, dateComptableFacture: null, montantTotalEnergie: null,
    montantRedevance: null, montantTCO: null, montantHorsTVA: null, montantTVA: null,
    montantFactureTTC: null, dateDebutPeriode: null, dateFinPeriode: null,
    aiCG: null, niCG: null, ancienIndexK1: null, ancienIndexK2: null,
    nouvelIndexK1: null, nouvelIndexK2: null, montantEnergieK1: null, montantEnergieK2: null,
    consommationFacturee: null, rappelEtMajoration: null, rappelK1: null, rappelK2: null,
    majorationK1: null, majorationK2: null, nbJourFacturation: null, puissanceSouscrite: null,
    puissanceMaxRelevee: null, montantPrimeFixe: null, montantCosinusPhi: null, valeurCosinusPhi: null,
    typeTarifNumero: null, typeTarifTexte: null, typeClientTexte: null, ccg: null,
    typeCompteContrat: null, ancCote: null, uniteReleve: null,
    ancienIndexReactif: null, nouvelIndexReactif: null, majoReactif: null,
    ancienIndexH1: null, nouvelIndexH1: null,
    agence: null, numeroCompteur: null, appartenance: null,
    puissanceSouscriteKW: null, categorieTarifaire: null, consK1: null, consK2: null,
    consT: null, consWr: null, heureH1: null, heureH2: null, puissanceTransfo: null,
    puissanceMaxKW: null, penalitesDepassement: null, anneeFacturation: null, moisFacturation: null,
  };

  BILLING_TEMPLATE_COLUMNS.forEach((col, i) => {
    const raw = rawValues[i];
    // "-" in any field means "not applicable for this project" — never flag as missing
    const rawStr = raw == null ? '' : String(raw).trim();
    if (rawStr === '-') {
      (row as Record<string, unknown>)[col.key] = null;
      if (col.required) row._skippedFields.push(col.key);
      return;
    }
    if (col.type === 'date') {
      (row as Record<string, unknown>)[col.key] = parseExcelDate(raw);
    } else if (col.type === 'number') {
      if (raw == null || raw === '') {
        (row as Record<string, unknown>)[col.key] = null;
      } else if (typeof raw === 'string' && raw.startsWith('=')) {
        (row as Record<string, unknown>)[col.key] = null;
      } else {
        const n = parseFloat(String(raw));
        (row as Record<string, unknown>)[col.key] = isNaN(n) ? null : n;
      }
    } else {
      if (typeof raw === 'string' && raw.startsWith('=')) {
        (row as Record<string, unknown>)[col.key] = null;
      } else {
        const s = raw == null ? null : String(raw).trim();
        (row as Record<string, unknown>)[col.key] = s === '' ? null : s;
      }
    }
  });

  return row;
}

// ─── Main async parser with chunking ─────────────────────────────────────────

async function parseWorkbook(file: File): Promise<BillingImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  const ws = wb.Sheets['Feuil1'];
  if (!ws) throw new Error("Feuille 'Feuil1' introuvable dans ce fichier.");

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (raw.length < 1) throw new Error('Le fichier est vide.');

  // Validate headers
  const headers = raw[0] as unknown[];
  const expectedHeaders = BILLING_TEMPLATE_COLUMNS.map(c => c.label);
  for (let i = 0; i < expectedHeaders.length; i++) {
    const expected = expectedHeaders[i].trim().toLowerCase().replace(/\s+/g, ' ');
    const actual = headers[i] == null ? '' : String(headers[i]).trim().toLowerCase().replace(/\s+/g, ' ');
    if (expected !== actual) {
      throw new Error(`Template invalide : colonne ${i + 1} attendue "${expectedHeaders[i]}", trouvée "${headers[i] ?? '(vide)'}"`);
    }
  }

  const dataRows = raw.slice(1).filter(r => Array.isArray(r) && r.some(c => c != null));

  // Parse in chunks to avoid blocking the UI thread
  const rows: BillingRow[] = [];
  for (let start = 0; start < dataRows.length; start += CHUNK_SIZE) {
    const chunk = dataRows.slice(start, start + CHUNK_SIZE);
    await new Promise<void>(resolve => setTimeout(() => {
      chunk.forEach((rawRow, idx) => {
        const row = parseRow(rawRow as unknown[], start + idx + 2);
        computeDerived(row);
        validateRow(row);
        rows.push(row);
      });
      resolve();
    }, 0));
  }

  return {
    rows,
    totalRows: rows.length,
    errorRows: rows.filter(r => r.rowErrors.length > 0).length,
    fileName: file.name,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseBillingImportReturn {
  result: BillingImportResult | null;
  isParsing: boolean;
  parseError: string | null;
  parseFile: (file: File) => Promise<void>;
  updateRow: (rowIndex: number, updated: BillingRow) => void;
  reset: () => void;
  autoRepair: () => void;
  skipErrors: () => void;
  forceAccept: () => void;
  removeDuplicates: () => void;
  resolveManual: (keptIndexes: Set<number>) => void;
  keepSingleRow: (rowIndex: number) => { removed: number; anomalousRemoved: number };
}

export function useBillingImport(): UseBillingImportReturn {
  const [result, setResult] = useState<BillingImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setResult(null);
    try {
      const res = await parseWorkbook(file);
      setResult(res);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Erreur de parsing inconnue');
    } finally {
      setIsParsing(false);
    }
  }, []);

  const updateRow = useCallback((rowIndex: number, updated: BillingRow) => {
    setResult(prev => {
      if (!prev) return prev;
      const rows = prev.rows.map(r => r._rowIndex === rowIndex ? updated : r);
      return {
        ...prev,
        rows,
        errorRows: rows.filter(r => r.rowErrors.length > 0).length,
      };
    });
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setParseError(null);
    setIsParsing(false);
  }, []);

  const autoRepair = useCallback(() => {
    setResult(prev => {
      if (!prev) return prev;
      const rows = prev.rows.map(r => r.rowErrors.length > 0 ? autoFixRow(r) : r);
      return { ...prev, rows, errorRows: rows.filter(r => r.rowErrors.length > 0).length };
    });
  }, []);

  const skipErrors = useCallback(() => {
    setResult(prev => {
      if (!prev) return prev;
      const rows = prev.rows.filter(r => r.rowErrors.length === 0);
      return { ...prev, rows, totalRows: rows.length, errorRows: 0 };
    });
  }, []);

  const forceAccept = useCallback(() => {
    setResult(prev => {
      if (!prev) return prev;
      const rows = prev.rows.map(r => ({ ...r, rowErrors: [] as string[] }));
      return { ...prev, rows, errorRows: 0 };
    });
  }, []);

  // Retire les doublons (même n° facture), conserve la version la plus cohérente
  // (= la facture redressée le cas échéant), supprime les versions incohérentes.
  const removeDuplicates = useCallback((): void => {
    setResult(prev => {
      if (!prev) return prev;
      const { dropped } = analyzeDuplicates(prev.rows);
      if (dropped.size === 0) return prev;
      const rows = prev.rows.filter(r => !dropped.has(r._rowIndex));
      return { ...prev, rows, totalRows: rows.length, errorRows: rows.filter(r => r.rowErrors.length > 0).length };
    });
  }, []);

  // Résolution manuelle : keptIndexes = ensemble des _rowIndex à conserver (un par groupe de doublons).
  // Toutes les autres versions dans le même groupe (même numeroFacture) sont retirées.
  const resolveManual = useCallback((keptIndexes: Set<number>): void => {
    setResult(prev => {
      if (!prev) return prev;
      const groups = new Map<number, number[]>();
      for (const r of prev.rows) {
        if (r.numeroFacture == null) continue;
        const g = groups.get(r.numeroFacture);
        if (g) g.push(r._rowIndex); else groups.set(r.numeroFacture, [r._rowIndex]);
      }
      const toRemove = new Set<number>();
      for (const rowIndexes of groups.values()) {
        if (rowIndexes.length < 2) continue;
        for (const idx of rowIndexes) {
          if (!keptIndexes.has(idx)) toRemove.add(idx);
        }
      }
      const rows = prev.rows.filter(r => !toRemove.has(r._rowIndex));
      return { ...prev, rows, totalRows: rows.length, errorRows: rows.filter(r => r.rowErrors.length > 0).length };
    });
  }, []);

  // Garde une seule ligne pour un numéro de facture donné et supprime toutes les autres versions.
  // Retourne les compteurs pour mise à jour du récapitulatif (removed, anomalousRemoved).
  const keepSingleRow = useCallback((rowIndex: number): { removed: number; anomalousRemoved: number } => {
    let removed = 0;
    let anomalousRemoved = 0;
    setResult(prev => {
      if (!prev) return prev;
      const target = prev.rows.find(r => r._rowIndex === rowIndex);
      if (!target || target.numeroFacture == null) return prev;
      const factureNum = target.numeroFacture;
      const toRemove = prev.rows.filter(r => r.numeroFacture === factureNum && r._rowIndex !== rowIndex);
      removed = toRemove.length;
      anomalousRemoved = toRemove.filter(r => detectAnomalies(r).count > 0).length;
      const rows = prev.rows.filter(r => r.numeroFacture !== factureNum || r._rowIndex === rowIndex);
      return { ...prev, rows, totalRows: rows.length, errorRows: rows.filter(r => r.rowErrors.length > 0).length };
    });
    return { removed, anomalousRemoved };
  }, []);

  return { result, isParsing, parseError, parseFile, updateRow, reset, autoRepair, skipErrors, forceAccept, removeDuplicates, resolveManual, keepSingleRow };
}

// Re-export for convenience
export { computeDerived, validateRow };
