/**
 * senelec-rules.ts
 * Règles de facturation SENELEC de référence — source unique pour le simulateur,
 * la saisie manuelle, l'import Excel et le mapper OCR. Fonctions pures, sans dépendance.
 *
 *   NJ   = fin − début + 1 (bornes incluses)
 *   PF   = Tpf × PS × NJ/30
 *   PDP  = 1,5 × Tpf × (Pmax − PS) × NJ/30
 *   cos φ : barème CER2E (neutre 0,80–0,95, pénalité par paliers, bonus au-dessus de 0,95)
 */

const MS_PAR_JOUR = 86_400_000
/** Au-delà, la période n'est plus une facture mensuelle/bimestrielle plausible */
export const NJ_MAX = 95

function versDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return isNaN(date.getTime()) ? null : date
}

/** Nombre de jours de la période, bornes incluses. `null` si dates absentes, inversées ou période > 95 j. */
export function calcNJ(debut: Date | string | null | undefined, fin: Date | string | null | undefined): number | null {
  const d1 = versDate(debut)
  const d2 = versDate(fin)
  if (!d1 || !d2) return null
  const ecart = Math.round((d2.getTime() - d1.getTime()) / MS_PAR_JOUR)
  const nj = ecart + 1
  return ecart >= 0 && nj <= NJ_MAX ? nj : null
}

/** Prime fixe proratisée : Tpf (FCFA/kW/mois) × PS (kW) × NJ/30. */
export function primeFixe(tpf: number, ps: number, nj: number): number {
  if (!tpf || !ps || !nj) return 0
  return tpf * ps * (nj / 30)
}

/** Pénalité de dépassement de puissance : 1,5 × Tpf × (Pmax − PS) × NJ/30, nulle sans dépassement. */
export function penaliteDepassement(tpf: number, ps: number, pmax: number, nj: number): number {
  if (!tpf || !nj || !(pmax > ps)) return 0
  return 1.5 * tpf * (pmax - ps) * (nj / 30)
}

// ─── Barème cos φ ────────────────────────────────────────────────────────────
// Source: SENELEC barème facteur de puissance (CER2E)
// Zone neutre : 0.80 ≤ cosφ ≤ 0.95 → 0%
// Bonus       : cosφ ≥ 0.96 → rabais = −n × 0.75% (n = steps au-dessus de 0.95, max 5)
// Pénalité    : cosφ < 0.80 → surcoût progressif

const COSPHI_PENALTY_BANDS: Array<{ min: number; max: number; pct: number }> = [
  { min: 0.80, max: Infinity, pct: 0  },  // zone neutre (0.80–0.95) + bonus (>0.95) géré séparément
  { min: 0.75, max: 0.80,    pct: 5  },
  { min: 0.70, max: 0.75,    pct: 10 },
  { min: 0.65, max: 0.70,    pct: 15 },
  { min: 0.60, max: 0.65,    pct: 20 },
  { min: 0.55, max: 0.60,    pct: 30 },
  { min: 0.50, max: 0.55,    pct: 40 },
  { min: 0.45, max: 0.50,    pct: 50 },
  { min: 0.40, max: 0.45,    pct: 65 },
  { min: 0,    max: 0.40,    pct: 80 },
]

/** Taux signé appliqué à (énergie + prime fixe) : > 0 = pénalité, < 0 = bonus, 0 = zone neutre. */
export function cosphiPenaltyPct(cosphi: number): number {
  if (!isFinite(cosphi) || cosphi <= 0) return 0
  if (cosphi >= 0.80 && cosphi <= 0.95) return 0
  if (cosphi > 0.95) {
    // Bonus: −n × 0.75% où n = steps au-dessus de 0.95, plafonné à 5
    const n = Math.min(5, Math.round((cosphi - 0.95) / 0.01))
    return -(n * 0.75)
  }
  const band = COSPHI_PENALTY_BANDS.find(b => cosphi >= b.min && cosphi < b.max)
  return band?.pct ?? 0
}
