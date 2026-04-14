// ============================================================
// IOT MODULE — Moteur de Facturation SENELEC
// Reproduit exactement les calculs du modèle Excel
// "2026-01-04-Modèle analyse facturation_DGA.xlsx"
// ============================================================

import type {
  CategorieTarifaire,
  DonneesTechniques,
  DonneesEnergieGP,
  DonneesEnergieBT,
  DonneesEnergie,
  ResultatFacturation,
  ScenarioOptimisation,
  TarifDetail,
  LigneFacturation,
} from '@/components/iot/shared';
import { TAUX_TVA } from '@/components/iot/shared';

// ============================================================
// GRILLE TARIFAIRE SENELEC — Février 2017
// ============================================================

export const GRILLE_TARIFAIRE: Record<CategorieTarifaire, TarifDetail> = {
  // --- Basse Tension ---
  DPP: {
    type: 'tranche',
    t1: 90.47,  t2: 101.64, t3: 112.65,
    seuil1: 150, seuil2: 100,
    primeMensuelle: 0,
    redevance: 944,
  },
  DMP: {
    type: 'tranche',
    t1: 96.02, t2: 102.44, t3: 112.02,
    seuil1: 50, seuil2: 250,
    primeMensuelle: 0,
    redevance: 0,
  },
  PPP: {
    type: 'tranche',
    t1: 128.85, t2: 135.68, t3: 147.68,
    seuil1: 50, seuil2: 450,
    primeMensuelle: 0,
    redevance: 0,
  },
  PMP: {
    type: 'tranche',
    t1: 129.81, t2: 136.53, t3: 149.24,
    seuil1: 100, seuil2: 400,
    primeMensuelle: 0,
    redevance: 0,
  },
  DGP: {
    type: 'gp',
    hhp: 86.30, hp: 120.81,
    primeFixe: 869.21,
    redevance30: 665, redevance31: 665,
  },
  PGP: {
    type: 'gp',
    hhp: 103.36, hp: 165.38,
    primeFixe: 2607.63,
    redevance30: 1427, redevance31: 1474,
  },
  // --- Moyenne Tension ---
  TCU: {
    type: 'mt',
    hhp: 111.59, hp: 172.77,
    primeFixe: 854.36,
  },
  TG: {
    type: 'mt',
    hhp: 80.31, hp: 128.50,
    primeFixe: 3636.45,
  },
  TLU: {
    type: 'mt',
    hhp: 65.98, hp: 105.57,
    primeFixe: 8777.13,
  },
  // --- Haute Tension ---
  TG_HT: {
    type: 'ht',
    hhp: 52.44, hp: 75.52,
    primeFixe: 8908.92,
  },
  TS: {
    type: 'ht',
    hhp: 77.25, hp: 111.23,
    primeFixe: 4381.50,
  },
};

// ============================================================
// CALCUL MAJOARTIONS — Formules exactes du modèle Excel
// Ma_K1 = αa × K1 + βa × H1 × K1/(K1+K2)
// Ma_K2 = αa × K2 + βa × H1 × K2/(K1+K2)
// Ma_Wr = αr × Wr + βr × H1
// ============================================================

export interface ResultatMajoration {
  majoK1: number;
  majoK2: number;
  majoWr: number;
  k1Facture: number;
  k2Facture: number;
}

export function calculerMajorations(
  k1: number,
  k2: number,
  wr: number,
  alphaA: number,
  betaA: number,
  alphaR: number,
  betaR: number,
  h1: number,
): ResultatMajoration {
  const totalKwh = k1 + k2;
  const ratioK1 = totalKwh > 0 ? k1 / totalKwh : 0;
  const ratioK2 = totalKwh > 0 ? k2 / totalKwh : 0;

  const majoK1 = alphaA * k1 + betaA * h1 * ratioK1;
  const majoK2 = alphaA * k2 + betaA * h1 * ratioK2;
  const majoWr = alphaR * wr + betaR * h1;

  return {
    majoK1,
    majoK2,
    majoWr,
    k1Facture: k1 + majoK1,
    k2Facture: k2 + majoK2,
  };
}

// ============================================================
// CALCUL CosPhi
// cosPhi = Ea / sqrt(Ea² + Er²)
// ============================================================

export function calculerCosPhi(ea: number, er: number): number {
  if (ea <= 0) return 1;
  return ea / Math.sqrt(ea * ea + er * er);
}

export function calculerBonusCosphi(_cosPhi: number, _montantEnergie: number): number {
  // Dans la grille SENELEC 2017, bonus/malus CosPhi n'est pas appliqué
  return 0;
}

// ============================================================
// TRANCHES BT
// ============================================================

function calculerCoûtTranches(
  consommation: number,
  tarif: TarifDetail & { type: 'tranche' }
): Pick<ResultatFacturation,
  'consomTranche1' | 'consomTranche2' | 'consomTranche3' |
  'coutTranche1'   | 'coutTranche2'   | 'coutTranche3'   | 'coutEnergie'> {
  const { t1, t2, t3, seuil1, seuil2 } = tarif;
  let c1 = 0, c2 = 0, c3 = 0;

  if (consommation <= seuil1) {
    c1 = consommation;
  } else if (consommation <= seuil1 + seuil2) {
    c1 = seuil1;
    c2 = consommation - seuil1;
  } else {
    c1 = seuil1;
    c2 = seuil2;
    c3 = consommation - seuil1 - seuil2;
  }

  return {
    consomTranche1: c1,  consomTranche2: c2,  consomTranche3: c3,
    coutTranche1: c1 * t1, coutTranche2: c2 * t2, coutTranche3: c3 * t3,
    coutEnergie: c1 * t1 + c2 * t2 + c3 * t3,
  };
}

// ============================================================
// CALCUL PRINCIPAL — Facturation GP / MT / HT avec majoartions
// ============================================================

function calculerCoûtGP(
  donnees: DonneesEnergieGP,
  tech: DonneesTechniques,
  tarif: TarifDetail & { type: 'gp' | 'mt' | 'ht' }
): Partial<ResultatFacturation> {
  const { consomActiveK1, consomActiveK2, consomReactiveWr } = donnees;
  const {
    nJours, nJoursDepassement,
    puissanceSouscrite, puissanceMaxRelevee,
    alphaA, betaA, alphaR, betaR, h1,
  } = tech;

  // --- Majoations ---
  const majo = calculerMajorations(
    consomActiveK1, consomActiveK2, consomReactiveWr,
    alphaA, betaA, alphaR, betaR, h1
  );

  // --- Coût énergie sur kWh facturés (K1 + MajoK1, K2 + MajoK2) ---
  const coutK1 = majo.k1Facture * tarif.hhp;
  const coutK2 = majo.k2Facture * tarif.hp;
  const coutEnergie = coutK1 + coutK2;

  // --- CosPhi ---
  const ea = consomActiveK1 + consomActiveK2;
  const er = consomReactiveWr + majo.majoWr;
  const cosPhi = calculerCosPhi(ea, er);
  const bonusCosphi = calculerBonusCosphi(cosPhi, coutEnergie);

  // --- Prime fixe mensuelle = Ps × tarif_prime × N/Nref (Nref = 30 fixe) ---
  const nRef = 30;
  const primeFixeMensuelle = puissanceSouscrite * tarif.primeFixe * (nJours / nRef);

  // --- Dépassement de puissance souscrite ---
  const depassement = Math.max(0, puissanceMaxRelevee - puissanceSouscrite);
  const majDepassement = depassement > 0
    ? depassement * tarif.primeFixe * 2 * (nJoursDepassement / nRef)
    : 0;

  const primeFixe = primeFixeMensuelle + majDepassement;

  return {
    majoK1: majo.majoK1,
    majoK2: majo.majoK2,
    majoWr: majo.majoWr,
    k1Facture: majo.k1Facture,
    k2Facture: majo.k2Facture,
    coutK1,
    coutK2,
    coutEnergie,
    cosPhi,
    bonusCosphi,
    primeFixeMensuelle,
    majDepassement,
    primeFixe,
    consomJournaliere: ea / nJours,
  };
}

// ============================================================
// CALCUL COMPLET
// ============================================================

export function calculerFacture(
  categorie: CategorieTarifaire,
  tech: DonneesTechniques,
  donnees: DonneesEnergie,
): ResultatFacturation {
  const tarif = GRILLE_TARIFAIRE[categorie];
  let resultat: Partial<ResultatFacturation> = {};

  if (tarif.type === 'tranche') {
    const d = donnees as DonneesEnergieBT;
    resultat = calculerCoûtTranches(d.consommationTotale, tarif);
    resultat.majoK1 = 0; resultat.majoK2 = 0; resultat.majoWr = 0;
    resultat.k1Facture = 0; resultat.k2Facture = 0;
    resultat.coutK1 = 0; resultat.coutK2 = 0;
    resultat.cosPhi = 1; resultat.bonusCosphi = 0;
    resultat.consomJournaliere = d.consommationTotale / tech.nJours;
    resultat.primeFixeMensuelle = 0;
    resultat.majDepassement = 0;
    resultat.primeFixe = tarif.primeMensuelle > 0
      ? tech.puissanceSouscrite * tarif.primeMensuelle
      : 0;
  } else if (tarif.type === 'gp' || tarif.type === 'mt' || tarif.type === 'ht') {
    const d = donnees as DonneesEnergieGP;
    resultat = calculerCoûtGP(d, tech, tarif as TarifDetail & { type: 'gp' | 'mt' | 'ht' });
  }

  // Redevance
  let redevance = tech.redevance ?? 0;
  if (redevance === 0) {
    if (tarif.type === 'tranche') redevance = tarif.redevance;
    else if (tarif.type === 'gp')
      redevance = tech.nJours <= 30 ? tarif.redevance30 : tarif.redevance31;
  }

  const montantEnergie   = resultat.coutEnergie ?? 0;
  const primeFixe        = resultat.primeFixe   ?? 0;
  const bonusCosphi      = resultat.bonusCosphi ?? 0;

  // Taxe communale (sur énergie + prime fixe)
  const taxeCommunale = (montantEnergie + primeFixe) * ((tech.taxeCommunale ?? 0) / 100);

  const montantHT  = montantEnergie + primeFixe + redevance + taxeCommunale - bonusCosphi;
  const tva        = montantHT * TAUX_TVA;
  const montantTTC = montantHT + tva;

  // Taux de charge transformateur
  const tauxChargeTransfo = tech.puissanceTransfo > 0
    ? (tech.puissanceMaxRelevee / tech.puissanceTransfo) * 100
    : 0;

  // IPR = Montant TTC / total kWh actifs
  const eaTotal = resultat.k1Facture !== undefined
    ? (resultat.k1Facture ?? 0) + (resultat.k2Facture ?? 0)
    : (donnees as DonneesEnergieBT).consommationTotale ?? 0;
  const ipr = eaTotal > 0 ? montantTTC / eaTotal : 0;

  // Tarif moyen pondéré HT
  const tarifMoyen = eaTotal > 0 ? montantHT / eaTotal : 0;

  // Décomposition
  const surcoût = (resultat.primeFixe ?? 0);
  const taxes   = tva + taxeCommunale + redevance;

  return {
    ...(resultat as ResultatFacturation),
    redevance,
    taxeCommunale,
    montantHT,
    tva,
    montantTTC,
    tauxChargeTransfo,
    ipr,
    tarifMoyen,
    surcoût,
    taxes,
  };
}

// ============================================================
// 5 SCÉNARIOS D'OPTIMISATION
// ============================================================

export function genererScenarios(
  categorie: CategorieTarifaire,
  tech: DonneesTechniques,
  donnees: DonneesEnergieGP,
): ScenarioOptimisation[] {
  const base = calculerFacture(categorie, tech, donnees);

  const eco = (r: ResultatFacturation) =>
    Math.max(0, base.montantTTC - r.montantTTC);

  const scenarios: ScenarioOptimisation[] = [];

  // 0 — Base
  scenarios.push({
    nom: 'Base',
    description: 'Situation actuelle sans modification',
    resultat: base,
    economieVsBase: 0,
    economieAnnuelle: 0,
    ipr: base.ipr,
  });

  // 1 — Réduction Ps (−10 %)
  const techPs1 = { ...tech, puissanceSouscrite: tech.puissanceSouscrite * 0.9 };
  const r1 = calculerFacture(categorie, techPs1, donnees);
  scenarios.push({
    nom: 'Ps ↓ −10 %',
    description: 'Réduire la puissance souscrite de 10 %',
    resultat: r1,
    economieVsBase: eco(r1),
    economieAnnuelle: eco(r1) * 12,
    ipr: r1.ipr,
  });

  // 2 — Augmentation Ps (+10 %)
  const techPs2 = { ...tech, puissanceSouscrite: tech.puissanceSouscrite * 1.1 };
  const r2 = calculerFacture(categorie, techPs2, donnees);
  scenarios.push({
    nom: 'Ps ↑ +10 %',
    description: 'Augmenter la puissance souscrite de 10 %',
    resultat: r2,
    economieVsBase: eco(r2),
    economieAnnuelle: eco(r2) * 12,
    ipr: r2.ipr,
  });

  // 3 — Amélioration CosPhi → 0.95 (réduction réactive de 30 %)
  const donnees3: DonneesEnergieGP = {
    ...donnees,
    consomReactiveWr: donnees.consomReactiveWr * 0.7,
  };
  const r3 = calculerFacture(categorie, tech, donnees3);
  scenarios.push({
    nom: 'CosPhi amélioré',
    description: 'Réduire l\'énergie réactive de 30 % (condensateurs)',
    resultat: r3,
    economieVsBase: eco(r3),
    economieAnnuelle: eco(r3) * 12,
    ipr: r3.ipr,
  });

  // 4 — Changement de tarif TG → TCU (si applicable)
  if (categorie === 'TG' || categorie === 'TLU') {
    const altCat: CategorieTarifaire = categorie === 'TG' ? 'TCU' : 'TG';
    const r4 = calculerFacture(altCat, tech, donnees);
    scenarios.push({
      nom: `Passage ${altCat}`,
      description: `Changer de catégorie tarifaire vers ${altCat}`,
      resultat: r4,
      economieVsBase: eco(r4),
      economieAnnuelle: eco(r4) * 12,
      ipr: r4.ipr,
    });
  } else if (categorie === 'TCU') {
    const r4 = calculerFacture('TG', tech, donnees);
    scenarios.push({
      nom: 'Passage TG',
      description: 'Changer de catégorie tarifaire vers TG',
      resultat: r4,
      economieVsBase: eco(r4),
      economieAnnuelle: eco(r4) * 12,
      ipr: r4.ipr,
    });
  }

  return scenarios;
}

// ============================================================
// IMPORT LIGNES FACTURATION depuis données brutes
// ============================================================

export function parseFacturationRow(raw: Record<string, unknown>): Partial<LigneFacturation> {
  const parseNum = (v: unknown) =>
    v !== null && v !== undefined && v !== '' ? Number(v) : 0;
  const parseDate = (v: unknown): Date | undefined => {
    if (!v) return undefined;
    if (v instanceof Date) return v;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? undefined : d;
  };

  return {
    date: parseDate(raw['Date'] ?? raw['date'] ?? raw['Période'] ?? raw['PERIODE']) ?? new Date(),
    nomClient: String(raw['NOM OU  RAISON SOCIALE'] ?? raw['nom'] ?? ''),
    adresse:   String(raw['ADRESSE LIVARISON'] ?? raw['adresse'] ?? ''),
    police:    String(raw['POLICE'] ?? raw['police'] ?? ''),
    factureNum: String(raw['FACTURE N°'] ?? raw['facture'] ?? ''),
    dateFacture: parseDate(raw['DATE FACTURE'] ?? raw['dateFacture']),
    nJours:     parseNum(raw['Nb jours'] ?? raw['nJours'] ?? 30),
    consomActiveK1:  parseNum(raw['Conso K1'] ?? raw['consomK1'] ?? raw['K1'] ?? 0),
    consomActiveK2:  parseNum(raw['Conso K2'] ?? raw['consomK2'] ?? raw['K2'] ?? 0),
    consomReactiveWr: parseNum(raw['Wr'] ?? raw['Reactif'] ?? raw['consomReactive'] ?? 0),
    majoK1: parseNum(raw['Majo K1'] ?? raw['majoK1'] ?? 0),
    majoK2: parseNum(raw['Majo K2'] ?? raw['majoK2'] ?? 0),
    majoReact: parseNum(raw['Majo Wr'] ?? raw['majoWr'] ?? 0),
    cosPhi: parseNum(raw['CosPhi'] ?? raw['cosPhi'] ?? 0),
    puissanceSouscrite: parseNum(raw['Ps'] ?? raw['puissance_souscrite'] ?? 0),
    puissanceMaxRelevee: parseNum(raw['Pmaxr'] ?? raw['puissance_max'] ?? 0),
    montantK1: parseNum(raw['Montant K1'] ?? raw['montantK1'] ?? 0),
    montantK2: parseNum(raw['Montant K2'] ?? raw['montantK2'] ?? 0),
    montantPrimeFixe: parseNum(raw['Prime fixe'] ?? raw['primeFixe'] ?? 0),
    montantHT: parseNum(raw['Montant HT'] ?? raw['montantHT'] ?? 0),
    redevance: parseNum(raw['Redevance'] ?? raw['redevance'] ?? 0),
    montantTVA: parseNum(raw['TVA'] ?? raw['montantTVA'] ?? 0),
    montantTTC: parseNum(raw['Montant TTC'] ?? raw['montantTTC'] ?? 0),
    prixTarifK1: parseNum(raw['Prix K1'] ?? raw['prixK1'] ?? 0),
    prixTarifK2: parseNum(raw['Prix K2'] ?? raw['prixK2'] ?? 0),
    ipr: parseNum(raw['IPR'] ?? raw['ipr'] ?? 0),
  };
}

// ============================================================
// UTILITAIRES
// ============================================================

export function calculerTarifMoyen(
  coutK1: number, consomK1: number,
  coutK2: number, consomK2: number
): number {
  const total = consomK1 + consomK2;
  if (total === 0) return 0;
  return (coutK1 + coutK2) / total;
}

export function calculerTauxChargeTransfo(pmaxr: number, puissanceTransfo: number): number {
  if (puissanceTransfo <= 0) return 0;
  return (pmaxr / puissanceTransfo) * 100;
}

export function formatFCFA(montant: number): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(montant)) + ' FCFA';
}

export function formatKWh(valeur: number, decimales = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur) + ' kWh';
}

// ============================================================
// CALCUL WOYOFAL (prépaiement)
// ============================================================

type CategoriesBT = 'DPP' | 'DMP' | 'PPP' | 'PMP';

export interface DonneesWoyofal {
  montantRecharge: number;
  dateLastRecharge: Date;
  dateNewRecharge: Date;
  categorie: CategoriesBT;
}

export function calculerTCO(donnees: DonneesWoyofal): number {
  const { montantRecharge, dateLastRecharge, dateNewRecharge, categorie } = donnees;
  const tarif = GRILLE_TARIFAIRE[categorie] as TarifDetail & { type: 'tranche' };
  const dureeMois = Math.ceil(
    (dateNewRecharge.getTime() - dateLastRecharge.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const redevanceTotale = tarif.redevance * dureeMois;
  const montantHT = montantRecharge / (1 + TAUX_TVA);
  return montantHT - redevanceTotale;
}
