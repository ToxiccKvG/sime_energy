// ═══════════════════════════════════════════════════════════════
// GRILLES TARIFAIRES SENELEC — Source: CER2E (Daouda Gassama)
// Valeurs en FCFA/kWh pour l'énergie, FCFA/kW/mois pour prime fixe
// ═══════════════════════════════════════════════════════════════

// Année de grille tarifaire — number pour autoriser les grilles custom
// définies par l'utilisateur dans Paramètres > Calculs & Énergie.
export type TariffYear = number
export const STANDARD_TARIFF_YEARS = [2017, 2019, 2023, 2026] as const

export type BTCategory  = 'DPP' | 'DMP' | 'PPP' | 'PMP' | 'DGP' | 'PGP'
export type MTCategory  = 'TCU' | 'TG'  | 'TLU'
export type HTCategory  = 'HTS' | 'HTG'
export type TariffCategory = BTCategory | MTCategory | HTCategory

// ── STRUCTURE DES TRANCHES BT (référence 60 jours) ──
// [LCT1, LCT2] — largeur de la tranche 1 et de la tranche 2 (kWh pour NJ=60)
// Tranche 3 = tout ce qui dépasse LCT1 + LCT2.
// Ajustement période réelle : seuil = LCT × NJ / 60
// Source: CER2E — seuils cumulés DPP:250, DMP:300, PPP:500, PMP:500
export const BT_TRANCHE_WIDTHS: Record<'DPP' | 'DMP' | 'PPP' | 'PMP', [number, number]> = {
  DPP: [150, 100],   // seuil1=150, seuil2=250
  DMP: [50,  250],   // seuil1=50,  seuil2=300
  PPP: [50,  450],   // seuil1=50,  seuil2=500
  PMP: [100, 400],   // seuil1=100, seuil2=500
}

// ── GRILLE 2017 ──
export const TARIFF_2017 = {
  BT: {
    DPP: { t1: 90.47,  t2: 101.64, t3: 112.65, pf: null,     k1: null, k2: null },
    DMP: { t1: 96.02,  t2: 102.44, t3: 112.02, pf: null,     k1: null, k2: null },
    PPP: { t1: 128.85, t2: 135.68, t3: 147.68, pf: null,     k1: null, k2: null },
    PMP: { t1: 129.81, t2: 136.53, t3: 149.24, pf: null,     k1: null, k2: null },
    DGP: { t1: null,   t2: null,   t3: null,   pf: 869.21,  k1: 86.30,  k2: 120.81 },
    PGP: { t1: null,   t2: null,   t3: null,   pf: 2607.63, k1: 103.36, k2: 165.38 },
  },
  MT: {
    TCU: { t1: null, t2: null, t3: null, pf:  907.32, k1: 118.51, k2: 183.48 },
    TG:  { t1: null, t2: null, t3: null, pf: 3861.89, k1:  85.29, k2: 136.46 },
    TLU: { t1: null, t2: null, t3: null, pf: 9321.26, k1:  70.07, k2: 112.12 },
  },
  HT: {
    HTS: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
    HTG: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
  },
}

// ── GRILLE 2019 ──
export const TARIFF_2019 = {
  BT: {
    DPP: { t1: 90.47,  t2: 101.64, t3: 112.65, pf: null,     k1: null, k2: null },
    DMP: { t1: 96.02,  t2: 102.44, t3: 112.02, pf: null,     k1: null, k2: null },
    PPP: { t1: 128.85, t2: 135.68, t3: 147.68, pf: null,     k1: null, k2: null },
    PMP: { t1: 129.81, t2: 136.53, t3: 149.24, pf: null,     k1: null, k2: null },
    DGP: { t1: null,   t2: null,   t3: null,   pf:  869.21,  k1:  86.30,  k2: 120.81 },
    PGP: { t1: null,   t2: null,   t3: null,   pf: 2607.63,  k1: 103.36,  k2: 165.38 },
  },
  MT: {
    TCU: { t1: null, t2: null, t3: null, pf:  961.76, k1: 155.50, k2: 248.28 },
    TG:  { t1: null, t2: null, t3: null, pf: 4093.60, k1: 111.91, k2: 184.65 },
    TLU: { t1: null, t2: null, t3: null, pf: 9880.54, k1:  91.93, k2: 151.72 },
  },
  HT: {
    HTS: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
    HTG: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
  },
}

// ── GRILLE 2023 ──
export const TARIFF_2023 = {
  BT: {
    DPP: { t1: 91.17,  t2: 136.49, t3: 159.36, pf: null,     k1: null, k2: null },
    DMP: { t1: 111.23, t2: 143.54, t3: 158.46, pf: null,     k1: null, k2: null },
    PPP: { t1: 163.81, t2: 189.84, t3: 208.63, pf: null,     k1: null, k2: null },
    PMP: { t1: 165.01, t2: 191.01, t3: 210.81, pf: null,     k1: null, k2: null },
    DGP: { t1: null,   t2: null,   t3: null,   pf: 956.13,  k1: 118.37, k2: 170.53 },
    PGP: { t1: null,   t2: null,   t3: null,   pf: 2868.39, k1: 140.74, k2: 232.23 },
  },
  MT: {
    TCU: { t1: null, t2: null, t3: null, pf:  961.76, k1: 155.50, k2: 248.28 },
    TG:  { t1: null, t2: null, t3: null, pf: 4093.60, k1: 111.91, k2: 184.65 },
    TLU: { t1: null, t2: null, t3: null, pf: 9880.54, k1:  91.93, k2: 151.72 },
  },
  HT: {
    HTS: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
    HTG: { t1: null, t2: null, t3: null, pf: null, k1: null, k2: null },
  },
}

export type TariffGrid = typeof TARIFF_2023

// ── GRILLE 2026 ──
// Source: Annexe SENELEC — Grille tarifaire applicable à partir du 1er janvier 2026
// BT: prix en FCFA/kWh par tranche (DPP/DMP/PPP/PMP) ou HHP/HP + prime fixe (DGP/PGP)
// MT/HT: prix en FCFA/kWh HHP et HP + prime fixe en FCFA/kW/mois
export const TARIFF_2026 = {
  BT: {
    DPP: { t1: 82.00,  t2: 130.40, t3: 159.46, pf: null,      k1: null,   k2: null   },
    DMP: { t1: 111.25, t2: 143.54, t3: 159.46, pf: null,      k1: null,   k2: null   },
    PPP: { t1: 82.00,  t2: 130.49, t3: 159.46, pf: null,      k1: null,   k2: null   },
    PMP: { t1: 111.25, t2: 143.54, t3: 159.46, pf: null,      k1: null,   k2: null   },
    DGP: { t1: null,   t2: null,   t3: null,   pf: 956.23,   k1: 140.54, k2: 222.22 },
    PGP: { t1: null,   t2: null,   t3: null,   pf: 2068.26,  k1: 140.54, k2: 222.22 },
  },
  MT: {
    TCU: { t1: null, t2: null, t3: null, pf: 961.76,   k1: 148.12, k2: 536.57 },
    TG:  { t1: null, t2: null, t3: null, pf: 1707.60,  k1: 111.81, k2: 160.83 },
    TLU: { t1: null, t2: null, t3: null, pf: 4603.54,  k1: 92.97,  k2: 111.25 },
  },
  HT: {
    HTS: { t1: null, t2: null, t3: null, pf: 10026.86, k1: 84.83,  k2: 108.27 },
    HTG: { t1: null, t2: null, t3: null, pf: 4458.61,  k1: 85.12,  k2: 148.49 },
  },
}

// Index principal — grilles standard (constantes)
export const SENELEC_TARIFFS: Record<number, TariffGrid> = {
  2017: TARIFF_2017,
  2019: TARIFF_2019,
  2023: TARIFF_2023,
  2026: TARIFF_2026,
}

// ── Registre des grilles custom (alimenté à l'exécution depuis user_metadata) ──
let _customGrids: Record<number, TariffGrid> = {}

/** Remplace l'ensemble des grilles custom (ne touche pas aux grilles standard). */
export function setCustomTariffGrids(grids: Record<number, TariffGrid> | null | undefined) {
  _customGrids = {}
  if (!grids) return
  for (const [yearStr, grid] of Object.entries(grids)) {
    const year = Number(yearStr)
    if (!Number.isFinite(year)) continue
    if ((STANDARD_TARIFF_YEARS as readonly number[]).includes(year)) continue
    _customGrids[year] = grid
  }
}

/** Récupère la grille pour une année — custom prioritaire sur standard. */
export function getTariffGrid(year: number): TariffGrid | undefined {
  return _customGrids[year] ?? SENELEC_TARIFFS[year]
}

/** Liste triée des années disponibles (standard + custom). */
export function getAvailableTariffYears(): number[] {
  const set = new Set<number>([
    ...STANDARD_TARIFF_YEARS,
    ...Object.keys(_customGrids).map(Number),
  ])
  return Array.from(set).sort((a, b) => a - b)
}

/** True si l'année provient d'une grille custom (utilisateur). */
export function isCustomTariffYear(year: number): boolean {
  return _customGrids[year] != null
}

// ── COEFFICIENTS DE PERTES DES TRANSFORMATEURS ──
// Source: CER2E — table SENELEC standard
// αa / βa : actifs (proportionnels à Wa et H1)
// αr / βr : réactifs (proportionnels à Wr et H1−H2)
// Lookup par puissance kVA — interpolation linéaire si valeur exacte absente.
// Table valide de 25 kVA à 650 kVA. Au-delà : renvoie null (hors plage).
export interface TransfoCoefficients {
  alphaA: number; // αa
  betaA:  number; // βa
  alphaR: number; // αr
  betaR:  number; // βr
}

export const TRANSFO_LOSS_TABLE: Array<{ kva: number } & TransfoCoefficients> = [
  { kva:  25, alphaA: 0.0280, betaA: 0.1150,  alphaR: 0.04, betaR:  0.825  },
  { kva:  50, alphaA: 0.0220, betaA: 0.1900,  alphaR: 0.04, betaR:  1.45   },
  { kva:  75, alphaA: 0.0198, betaA: 0.2550,  alphaR: 0.04, betaR:  1.975  },
  { kva: 100, alphaA: 0.0175, betaA: 0.3200,  alphaR: 0.04, betaR:  2.5    },
  { kva: 125, alphaA: 0.0163, betaA: 0.3783,  alphaR: 0.04, betaR:  2.9917 },
  { kva: 160, alphaA: 0.0147, betaA: 0.4600,  alphaR: 0.04, betaR:  3.68   },
  { kva: 200, alphaA: 0.0143, betaA: 0.5500,  alphaR: 0.04, betaR:  4.4    },
  { kva: 225, alphaA: 0.0137, betaA: 0.6000,  alphaR: 0.04, betaR:  4.825  },
  { kva: 250, alphaA: 0.0130, betaA: 0.6500,  alphaR: 0.04, betaR:  5.25   },
  { kva: 275, alphaA: 0.0557, betaA: 0.6962,  alphaR: 0.04, betaR:  5.6538 },
  { kva: 300, alphaA: 0.0984, betaA: 0.7423,  alphaR: 0.04, betaR:  6.0577 },
  { kva: 315, alphaA: 0.1240, betaA: 0.7700,  alphaR: 0.04, betaR:  6.3    },
  { kva: 350, alphaA: 0.0777, betaA: 0.8359,  alphaR: 0.04, betaR:  6.8353 },
  { kva: 375, alphaA: 0.0446, betaA: 0.8829,  alphaR: 0.04, betaR:  7.2176 },
  { kva: 400, alphaA: 0.0115, betaA: 0.9300,  alphaR: 0.04, betaR:  7.6    },
  { kva: 425, alphaA: 0.0114, betaA: 0.9725,  alphaR: 0.04, betaR:  8.075  },
  { kva: 450, alphaA: 0.0113, betaA: 1.0150,  alphaR: 0.04, betaR:  8.55   },
  { kva: 475, alphaA: 0.0111, betaA: 1.0575,  alphaR: 0.04, betaR:  9.025  },
  { kva: 500, alphaA: 0.0110, betaA: 1.1000,  alphaR: 0.04, betaR:  9.05   },
  { kva: 525, alphaA: 0.0109, betaA: 1.1385,  alphaR: 0.04, betaR:  9.8538 },
  { kva: 550, alphaA: 0.0107, betaA: 1.1769,  alphaR: 0.04, betaR: 10.208  },
  { kva: 575, alphaA: 0.0106, betaA: 1.2154,  alphaR: 0.04, betaR: 10.562  },
  { kva: 600, alphaA: 0.0105, betaA: 1.2538,  alphaR: 0.04, betaR: 10.915  },
  { kva: 625, alphaA: 0.0103, betaA: 1.2923,  alphaR: 0.04, betaR: 11.269  },
  { kva: 630, alphaA: 0.0103, betaA: 1.3000,  alphaR: 0.04, betaR: 11.34   },
  { kva: 650, alphaA: 0.0102, betaA: 1.3308,  alphaR: 0.04, betaR: 11.623  },
];

/**
 * Retourne les coefficients de pertes pour un transformateur de `kva` kVA.
 * Interpolation linéaire si la valeur exacte est absente.
 * Retourne null si hors plage (< 25 kVA ou > 650 kVA).
 */
export function getTransfoCoefficients(kva: number): TransfoCoefficients | null {
  if (!isFinite(kva) || kva <= 0) return null;
  const t = TRANSFO_LOSS_TABLE;
  if (kva < t[0].kva || kva > t[t.length - 1].kva) return null;
  const exact = t.find(r => r.kva === kva);
  if (exact) return { alphaA: exact.alphaA, betaA: exact.betaA, alphaR: exact.alphaR, betaR: exact.betaR };
  const lower = [...t].reverse().find(r => r.kva < kva)!;
  const upper = t.find(r => r.kva > kva)!;
  const f = (kva - lower.kva) / (upper.kva - lower.kva);
  return {
    alphaA: lower.alphaA + f * (upper.alphaA - lower.alphaA),
    betaA:  lower.betaA  + f * (upper.betaA  - lower.betaA),
    alphaR: lower.alphaR + f * (upper.alphaR - lower.alphaR),
    betaR:  lower.betaR  + f * (upper.betaR  - lower.betaR),
  };
}

// ── CATÉGORIES PAR DOMAINE ──
export const CATEGORIES_BY_TENSION: Record<'BT' | 'MT' | 'HT', TariffCategory[]> = {
  BT: ['DPP', 'DMP', 'PPP', 'PMP', 'DGP', 'PGP'],
  MT: ['TCU', 'TG', 'TLU'],
  HT: ['HTS', 'HTG'],
}

// Libellés affichables
export const CATEGORY_LABELS: Record<TariffCategory, string> = {
  DPP: 'DPP — Domestique Petite Puissance',
  DMP: 'DMP — Domestique Moyenne Puissance',
  PPP: 'PPP — Professionnel Petite Puissance',
  PMP: 'PMP — Professionnel Moyenne Puissance',
  DGP: 'DGP — Domestique Grande Puissance',
  PGP: 'PGP — Professionnel Grande Puissance',
  TCU: 'TCU — Tarif Courte Utilisation (< 1 000 h)',
  TG:  'TG — Tarif Général (1 000–4 000 h)',
  TLU: 'TLU — Tarif Longue Utilisation (> 4 000 h)',
  HTS: 'HTS — Haute Tension Standard',
  HTG: 'HTG — Haute Tension Grande',
}

// ── HEURES DE POINTE ──
export const PEAK_HOURS        = { start: 19, end: 23 }
export const PEAK_HOURS_PER_DAY    = 4   // K2 = 4h/jour
export const OFF_PEAK_HOURS_PER_DAY = 20  // K1 = 20h/jour

// ── TAXES ──
export const TVA_RATE    = 0.18   // 18 % — applicable BT + MT + HT
export const TCO_RATE_BT = 0.025  // 2.5 % — taxe communale BT uniquement (MT/HT = 0)

// ── COS PHI ──
export const COSPHI_PENALTY_THRESHOLD = 0.80
export const COSPHI_BONUS_THRESHOLD   = 0.95
export const COSPHI_DEFAULT_TRANSFO   = 0.87

// ── CHOIX TARIF MT ──
export const MT_TARIFF_THRESHOLDS = {
  TCU_max: 1000,
  TG_max:  4000,
}

// ── PLAGES DE PUISSANCE BT (kW) ──
export const BT_POWER_RANGES = {
  PP: { min: 0,  max: 6   },
  MP: { min: 6,  max: 17  },
  GP: { min: 17, max: 100 },
}

// ── CATÉGORIES BT PAR BANDE DE PUISSANCE ──
export type BTPowerBand = 'PP' | 'MP' | 'GP'

export const BT_BAND_LABELS: Record<BTPowerBand, string> = {
  PP: 'PP — Petite Puissance (0–6 kW)',
  MP: 'MP — Moyenne Puissance (6–17 kW)',
  GP: 'GP — Grande Puissance (17–100 kW)',
}

export const BT_BAND_CATEGORIES: Record<BTPowerBand, BTCategory[]> = {
  PP: ['DPP', 'PPP'],
  MP: ['DMP', 'PMP'],
  GP: ['DGP', 'PGP'],
}

// ── PLAGES DE TENSION/PUISSANCE POUR AUTO-DÉTECTION ──
// Seuils SENELEC Sénégal (0–1000V BT / 1000–30000V MT / >30000V HT)
// Plafond pratique BT = 100 kW, MT = 1250 kW
export const TENSION_POWER_THRESHOLDS = {
  BT_max_kw: 100,
  MT_max_kw: 1250,
}

/**
 * Suggère le domaine de tension et la bande BT à partir d'une puissance souscrite (kW).
 * Retourne null si ps_kw invalide.
 */
export function suggestTensionFromPS(ps_kw: number): {
  domaine: 'BT' | 'MT' | 'HT'
  band?: BTPowerBand
  label: string
} | null {
  if (!isFinite(ps_kw) || ps_kw <= 0) return null
  if (ps_kw <= BT_POWER_RANGES.PP.max) return { domaine: 'BT', band: 'PP', label: `BT — PP (${ps_kw} kW ≤ 6 kW)` }
  if (ps_kw <= BT_POWER_RANGES.MP.max) return { domaine: 'BT', band: 'MP', label: `BT — MP (${ps_kw} kW ≤ 17 kW)` }
  if (ps_kw <= TENSION_POWER_THRESHOLDS.BT_max_kw) return { domaine: 'BT', band: 'GP', label: `BT — GP (${ps_kw} kW ≤ 100 kW)` }
  if (ps_kw <= TENSION_POWER_THRESHOLDS.MT_max_kw) return { domaine: 'MT', label: `MT (${ps_kw} kW ≤ 1 250 kW)` }
  return { domaine: 'HT', label: `HT (${ps_kw} kW > 1 250 kW)` }
}
