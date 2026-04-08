/**
 * Service de calcul IoT
 * Implémente toutes les formules du modèle Shelly 3EM XLSX :
 * - 17 colonnes calculées par phase
 * - Bilan M1–M5 (M3 = M1+M5, M5 = M2-M1, taux couverture, économies)
 * - Calcul simulation (kWh économisés, % réduction, gain en devise)
 */

import type { IotReading, BilanM1M5, LigneTCD } from '@/lib/iot-mesures-service';
import type { SimulationConditions, SimulationResultatDetail } from '@/lib/iot-simulations-service';
import { calculerMontantEnergie, estHeureDePointe, type IotTarif } from '@/lib/iot-tarifs-service';
import type { IotFerie } from '@/lib/iot-calendrier-service';
import { classifierJour } from '@/lib/iot-calendrier-service';

// ─── Classification temporelle ────────────────────────────────────────────────

export function getPeriodeJournee(heure: number): string {
  if (heure < 6)  return 'Nuit';
  if (heure < 12) return 'Matin';
  if (heure < 14) return 'Midi';
  if (heure < 18) return 'Après-midi';
  if (heure < 22) return 'Soir';
  return 'Nuit';
}

export function getPeriodeClimatique(mois: number): string {
  if ([12, 1, 2].includes(mois)) return 'Période de fraîcheur';
  if ([3, 4, 5].includes(mois))  return 'Période de chaleur';
  return 'Période de forte chaleur';
}

export function getSaison(mois: number): string {
  return mois >= 7 && mois <= 9 ? 'Saison pluvieuse' : 'Saison sèche';
}

export function getEnsoleillement(heure: number): string {
  return heure >= 8 && heure <= 18 ? 'Au fil du soleil' : 'Hors ensoleillement';
}

export function getHeuresTravail(jourSemaine: number, heure: number): string {
  // jourSemaine: 0=dim, 1=lun, ..., 6=sam
  const estSemaine = jourSemaine >= 1 && jourSemaine <= 6;
  const estHoraire = heure >= 8 && heure < 19;
  return estSemaine && estHoraire ? 'Heures d\'activités' : 'Heures hors activités';
}

export function getFluxEnergetique(puissanceW: number): string {
  if (puissanceW < 0) return 'Injection';
  if (puissanceW > 0) return 'Soutirage';
  return 'Nul';
}

// ─── Bilan M1–M5 (côté client) ────────────────────────────────────────────────

/**
 * Calcule le bilan énergétique depuis un tableau de lectures déjà chargées.
 * Utilisé pour l'affichage instantané sans requête supplémentaire.
 */
export function calculerBilanM1M5(
  lectures: IotReading[],
  tarif: IotTarif,
): BilanM1M5 {
  const totaux: Record<string, number> = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
  let montantM1 = 0;
  let montantM5 = 0;

  for (const r of lectures) {
    const code = r.source_code;
    if (!code) continue;
    const kwh = r.kwh_total ?? 0;
    totaux[code] = (totaux[code] ?? 0) + kwh;

    if (code === 'M1') montantM1 += calculerMontantEnergie(kwh, r.heure_decimal ?? 12, tarif);
    if (code === 'M5') montantM5 += calculerMontantEnergie(kwh, r.heure_decimal ?? 12, tarif);
  }

  const m5_kwh = totaux.M5 > 0 ? totaux.M5 : Math.max(0, totaux.M2 - totaux.M1);
  const m3_kwh = totaux.M3 > 0 ? totaux.M3 : totaux.M1 + m5_kwh;

  return {
    m1_kwh: round(totaux.M1),
    m2_kwh: round(totaux.M2),
    m3_kwh: round(m3_kwh),
    m4_kwh: round(totaux.M4),
    m5_kwh: round(m5_kwh),
    taux_couverture_pct:   m3_kwh > 0 ? round((m5_kwh / m3_kwh) * 100, 1) : 0,
    taux_autoconsommation: m3_kwh > 0 ? round(m5_kwh / m3_kwh, 3) : 0,
    energie_injectee_kwh:  round(Math.max(0, m5_kwh - m3_kwh)),
    economie_devise:       Math.round(montantM5),
    cout_reseau_devise:    Math.round(montantM1),
  };
}

// ─── Calcul simulation ────────────────────────────────────────────────────────

/**
 * Applique un scénario de simulation sur un ensemble de lectures.
 * Retourne les kWh économisés, % réduction et gain en devise.
 */
export function calculerSimulation(
  lectures: IotReading[],
  conditions: SimulationConditions,
  tarif: IotTarif,
  feries: IotFerie[],
): {
  kwh_economises: number;
  pct_reduction: number;
  gain_devise: number;
  resultats_detail: SimulationResultatDetail;
} {
  // Filtrer les lectures selon les conditions
  const filtrees = lectures.filter(r => {
    const date   = new Date(r.timestamp);
    const heure  = r.heure_decimal ?? 0;
    const jour   = classifierJour(date, feries);

    // Filtre plage horaire
    if (conditions.plage_horaire) {
      const debut = parseHeure(conditions.plage_horaire.debut);
      const fin   = parseHeure(conditions.plage_horaire.fin);
      if (heure < debut || heure > fin) return false;
    }

    // Filtre HP/HC
    if (conditions.separer_hp_hc) {
      if (!estHeureDePointe(heure, tarif)) return false;
    }

    // Filtre type de jour
    if (conditions.jours && !conditions.jours.includes('all')) {
      if (conditions.jours.includes('ouvre') && jour !== 'Jour ouvré') return false;
      if (conditions.jours.includes('weekend') && jour !== 'Weekend') return false;
    }

    // Exclure fériés
    if (conditions.exclure_feries && jour === 'Jour férié') return false;

    // Exclure aberrants (puissance > 10 MW)
    if (conditions.exclure_aberrants && Math.abs(r.kw_total) > 10000) return false;

    // Filtre sources
    if (conditions.sources?.length && r.source_code && !conditions.sources.includes(r.source_code)) return false;

    return true;
  });

  // Appliquer coefficient
  const coef = conditions.coefficient ?? 1;

  let kwh_baseline = 0;
  let kwh_simule   = 0;
  let gain_devise  = 0;

  // Agrégation par mois pour le détail
  const parMois = new Map<string, { kwh_base: number; kwh_sim: number; devise: number }>();

  for (const r of filtrees) {
    const kwh_base = (r.kwh_total ?? 0);
    const kwh_sim  = kwh_base * coef;
    const delta_kwh = kwh_base - kwh_sim;
    const montant   = calculerMontantEnergie(delta_kwh, r.heure_decimal ?? 12, tarif);

    kwh_baseline += kwh_base;
    kwh_simule   += kwh_sim;
    gain_devise  += montant;

    const mois = `${r.annee}-${String(new Date(r.timestamp).getMonth() + 1).padStart(2, '0')}`;
    const existing = parMois.get(mois) ?? { kwh_base: 0, kwh_sim: 0, devise: 0 };
    existing.kwh_base += kwh_base;
    existing.kwh_sim  += kwh_sim;
    existing.devise   += montant;
    parMois.set(mois, existing);
  }

  const kwh_economises = round(kwh_baseline - kwh_simule);
  const pct_reduction  = kwh_baseline > 0 ? round((kwh_economises / kwh_baseline) * 100, 1) : 0;

  const resultats_detail: SimulationResultatDetail = {
    par_mois: Array.from(parMois.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, val]) => ({
        mois,
        kwh:    round(val.kwh_base - val.kwh_sim),
        devise: Math.round(val.devise),
      })),
  };

  return {
    kwh_economises,
    pct_reduction,
    gain_devise: Math.round(gain_devise),
    resultats_detail,
  };
}

// ─── TCD côté client ──────────────────────────────────────────────────────────

/**
 * Pivot des lectures selon un axe donné.
 * Retourne les lignes agrégées (kWh, kW moy/max/min, montant devise).
 */
export function pivotLectures(
  lectures: IotReading[],
  axe: keyof IotReading,
  tarif?: IotTarif,
): LigneTCD[] {
  const map = new Map<string, { kwh: number; kw: number[]; devise: number }>();

  for (const r of lectures) {
    const dim = String(r[axe] ?? 'N/A');
    const existing = map.get(dim) ?? { kwh: 0, kw: [], devise: 0 };
    existing.kwh += r.kwh_total ?? 0;
    existing.kw.push(r.kw_total ?? 0);
    if (tarif) existing.devise += calculerMontantEnergie(r.kwh_total ?? 0, r.heure_decimal ?? 12, tarif);
    map.set(dim, existing);
  }

  return Array.from(map.entries())
    .map(([dimension, val]) => ({
      dimension,
      kwh_total:     round(val.kwh),
      kw_moyen:      val.kw.length ? round(val.kw.reduce((a, b) => a + b, 0) / val.kw.length, 3) : 0,
      kw_max:        val.kw.length ? round(Math.max(...val.kw), 3) : 0,
      kw_min:        val.kw.length ? round(Math.min(...val.kw), 3) : 0,
      montant_devise: Math.round(val.devise),
    }))
    .sort((a, b) => b.kwh_total - a.kwh_total);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round(n: number, decimales = 2): number {
  const factor = Math.pow(10, decimales);
  return Math.round(n * factor) / factor;
}

function parseHeure(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m ?? 0) / 60;
}
