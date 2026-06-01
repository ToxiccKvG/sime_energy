// ============================================================
// IOT MODULE — Moteur PDF
// Import  : extraction de texte + parsing factures énergie
// Export  : génération PDF (tableau, graphiques)
// ============================================================

import * as pdfjs from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Worker via ?url (compatible Vite)
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ============================================================
// TYPES
// ============================================================

export interface FactureParsee {
  texteComplet: string;
  source: 'SENELEC' | 'EDF' | 'AUTRE';
  periode?: { debut: Date; fin: Date };
  consommationKwh?: number;
  montantFcfa?: number;
  montantEur?: number;
  puissanceSouscrite?: number; // kVA
  numeroClient?: string;
  nomClient?: string;
}

// ============================================================
// EXTRACTION TEXTE
// ============================================================

export async function extraireTextePDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n');
}

// ============================================================
// PARSING FACTURE ÉNERGIE
// ============================================================

function parseDate(str: string): Date | null {
  const parts = str.split('/').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const [d, m, y] = parts;
    return new Date(y < 100 ? y + 2000 : y, m - 1, d);
  }
  return null;
}

function parseNum(str: string): number {
  return parseFloat(str.replace(/[\s' ]/g, '').replace(',', '.'));
}

export function parserFactureEnergie(texte: string): FactureParsee {
  const result: FactureParsee = {
    texteComplet: texte,
    source: /senelec/i.test(texte) ? 'SENELEC'
           : /\bedf\b|électricité de france/i.test(texte) ? 'EDF'
           : 'AUTRE',
  };

  // Période : "du 01/03/2025 au 31/03/2025" ou plages ISO/slash
  const periodeMatch =
    texte.match(/du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i) ??
    texte.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–àa]\s*(\d{2}\/\d{2}\/\d{4})/);
  if (periodeMatch) {
    const debut = parseDate(periodeMatch[1]);
    const fin   = parseDate(periodeMatch[2]);
    if (debut && fin) result.periode = { debut, fin };
  }

  // Consommation kWh — garde la valeur la plus élevée (= total global)
  const kwhMatches = [...texte.matchAll(/(\d[\d\s,.']*)\s*kWh/gi)];
  if (kwhMatches.length > 0) {
    const vals = kwhMatches.map((m) => parseNum(m[1])).filter((v) => isFinite(v) && v > 0);
    if (vals.length > 0) result.consommationKwh = Math.max(...vals);
  }

  // Montant FCFA / XOF
  const fcfaMatch = texte.match(/(\d[\d\s,.']*)\s*(?:F\.?\s*CFA|FCFA|XOF)/i);
  if (fcfaMatch) {
    const v = parseNum(fcfaMatch[1]);
    if (isFinite(v)) result.montantFcfa = v;
  }

  // Montant EUR
  const eurMatch =
    texte.match(/(\d[\d\s,.']*)\s*€/) ??
    texte.match(/€\s*([\d\s,.']+)/);
  if (eurMatch) {
    const v = parseNum(eurMatch[1]);
    if (isFinite(v)) result.montantEur = v;
  }

  // Puissance souscrite (kVA)
  const kvaMatch = texte.match(/(\d[\d,.]*)\s*kVA/i);
  if (kvaMatch) {
    const v = parseNum(kvaMatch[1]);
    if (isFinite(v)) result.puissanceSouscrite = v;
  }

  // Numéro client / contrat
  const numMatch = texte.match(
    /(?:N[°º]\.?\s*(?:client|compte|contrat|abonnement)|référence\s+client|ref\.?\s*client)\s*:?\s*([\w-]{4,})/i
  );
  if (numMatch) result.numeroClient = numMatch[1].trim();

  // Nom client (tentative heuristique)
  const nomMatch = texte.match(
    /(?:nom\s+(?:du\s+)?client|titulaire|client)\s*:?\s*([A-ZÉÀÂÛÎÔ][a-zA-ZÀ-ÿ'\- ]{2,40})/
  );
  if (nomMatch) result.nomClient = nomMatch[1].trim();

  return result;
}
