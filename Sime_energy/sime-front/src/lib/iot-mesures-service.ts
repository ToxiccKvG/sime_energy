import { supabase } from '@/lib/supabase';
import type { SourceCode } from './iot-sources-service';
import { calculerMontantEnergie, type IotTarif } from './iot-tarifs-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Granularite = '15min' | '30min' | '1h' | '1j' | '1sem';
export type TrancheHoraire = 'Heure de pointe' | 'Heure creuse';
export type FluxEnergetique = 'Injection' | 'Soutirage' | 'Nul';
export type PeriodeJournee = 'Nuit' | 'Matin' | 'Midi' | 'Après-midi' | 'Soir';
export type PeriodeClimatique = 'Période de fraîcheur' | 'Période de chaleur' | 'Période de forte chaleur';
export type Saison = 'Saison pluvieuse' | 'Saison sèche';

export interface IotReading {
  id: number;
  timestamp: string;
  organization_id: string;
  iot_site_id: string | null;
  site: string | null;
  device_id: string;
  source_code: SourceCode | null;
  source_nom: string | null;
  source_couleur: string | null;
  // Puissances
  kw_total: number;
  kw_a: number;
  kw_b: number;
  kw_c: number;
  w_total: number | null;
  // Tensions & courants
  voltage_a: number | null;
  voltage_b: number | null;
  voltage_c: number | null;
  current_a: number | null;
  current_b: number | null;
  current_c: number | null;
  // Énergie
  kwh_total: number;
  // Colonnes calculées
  flux_energetique: FluxEnergetique;
  tranche_tarification: TrancheHoraire;
  heures_ensoleillement: string;
  heures_travail: string;
  periode_journee: PeriodeJournee;
  periode_climatique: PeriodeClimatique;
  saison: Saison;
  heure_decimal: number;
  jour_semaine: string;
  mois_nom: string;
  annee: number;
  // Env.
  temperature: number | null;
  humidity: number | null;
}

export interface FiltresMesures {
  siteId: string;
  dateDebut: string;    // ISO date 'YYYY-MM-DD'
  dateFin: string;
  sources?: SourceCode[];
  granularite?: Granularite;
  tranche?: TrancheHoraire;
  fluxType?: FluxEnergetique;
}

export interface BilanM1M5 {
  // Valeurs brutes (kWh)
  m1_kwh: number;   // Réseau acheté
  m2_kwh: number;   // ATS (passage total)
  m3_kwh: number;   // Charge totale réelle = M1 + M5
  m4_kwh: number;   // Groupe électrogène
  m5_kwh: number;   // PV+batterie = M2 - M1 (si déduit)
  // Indicateurs
  taux_couverture_pct: number;     // (M5 / M3) × 100
  taux_autoconsommation: number;   // M5 / M3
  energie_injectee_kwh: number;    // Production PV - M5 consommée
  // Financier
  economie_devise: number;         // M5 × coût unitaire réel
  cout_reseau_devise: number;      // M1 × coût unitaire réel
}

export interface PointCourbe {
  timestamp: string;
  kw_total: number;
  kw_a: number | null;
  kw_b: number | null;
  kw_c: number | null;
  source_code: SourceCode | null;
  tranche_tarification: TrancheHoraire;
  flux_energetique: FluxEnergetique;
}

export interface LigneTCD {
  dimension: string;      // valeur de l'axe (ex: "Janvier", "Lundi", "M1")
  kwh_total: number;
  kw_moyen: number;
  kw_max: number;
  kw_min: number;
  montant_devise: number;
}

// ─── Requêtes principales ─────────────────────────────────────────────────────

/**
 * Charge les mesures enrichies depuis la vue iot_mesures_enrichies.
 * Utilisé pour la courbe de charge.
 */
export async function getMesuresEnrichies(
  filtres: FiltresMesures,
): Promise<IotReading[]> {
  let query = supabase
    .from('iot_mesures_enrichies')
    .select('*')
    .eq('iot_site_id', filtres.siteId)
    .gte('timestamp', `${filtres.dateDebut}T00:00:00Z`)
    .lte('timestamp', `${filtres.dateFin}T23:59:59Z`)
    .order('timestamp', { ascending: true });

  if (filtres.sources?.length) {
    query = query.in('source_code', filtres.sources);
  }
  if (filtres.tranche) {
    query = query.eq('tranche_tarification', filtres.tranche);
  }
  if (filtres.fluxType) {
    query = query.eq('flux_energetique', filtres.fluxType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as IotReading[];
}

/**
 * Insère des lectures en batch dans iot_readings.
 * Utilisé par le pipeline d'import (CSV/XLSX → normalisation → stockage).
 */
export async function insertIotReadings(
  rows: Array<{
    organization_id: string;
    iot_site_id: string;
    timestamp: string;
    site?: string;
    device_id: string;
    source_code?: SourceCode;
    power?: number;
    power_a?: number;
    power_b?: number;
    power_c?: number;
    total_power?: number;
    voltage_a?: number;
    voltage_b?: number;
    voltage_c?: number;
    current_a?: number;
    current_b?: number;
    current_c?: number;
    energy_total?: number;
    raw?: Record<string, unknown>;
  }>,
): Promise<{ count: number }> {
  const { error, count } = await supabase
    .from('iot_readings')
    .insert(rows, { count: 'exact' });

  if (error) throw error;
  return { count: count ?? rows.length };
}

/**
 * Calcule le bilan énergétique M1–M5 sur une période.
 */
export async function getBilanM1M5(
  siteId: string,
  dateDebut: string,
  dateFin: string,
  tarif: IotTarif,
): Promise<BilanM1M5> {
  const { data, error } = await supabase
    .from('iot_mesures_enrichies')
    .select('source_code, kwh_total, heure_decimal')
    .eq('iot_site_id', siteId)
    .gte('timestamp', `${dateDebut}T00:00:00Z`)
    .lte('timestamp', `${dateFin}T23:59:59Z`)
    .in('source_code', ['M1', 'M2', 'M3', 'M4', 'M5']);

  if (error) throw error;

  // Sommer par source
  const totaux: Record<string, number> = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
  let montantM1 = 0;
  let montantM5 = 0;

  for (const row of data || []) {
    const code = row.source_code as SourceCode;
    if (code && totaux[code] !== undefined) {
      totaux[code] += row.kwh_total ?? 0;
    }
    // Coût réseau (M1) et économie (M5)
    if (code === 'M1') montantM1 += calculerMontantEnergie(row.kwh_total ?? 0, row.heure_decimal ?? 12, tarif);
    if (code === 'M5') montantM5 += calculerMontantEnergie(row.kwh_total ?? 0, row.heure_decimal ?? 12, tarif);
  }

  // Si M5 non mesuré directement : M5 = M2 - M1
  const m5_kwh = totaux.M5 > 0 ? totaux.M5 : Math.max(0, totaux.M2 - totaux.M1);
  // M3 (charge réelle) = M1 + M5
  const m3_kwh = totaux.M3 > 0 ? totaux.M3 : totaux.M1 + m5_kwh;

  const taux_couverture_pct    = m3_kwh > 0 ? (m5_kwh / m3_kwh) * 100 : 0;
  const taux_autoconsommation  = m3_kwh > 0 ? m5_kwh / m3_kwh : 0;
  const energie_injectee_kwh   = Math.max(0, m5_kwh - m3_kwh);

  return {
    m1_kwh: totaux.M1,
    m2_kwh: totaux.M2,
    m3_kwh,
    m4_kwh: totaux.M4,
    m5_kwh,
    taux_couverture_pct:   Math.round(taux_couverture_pct * 10) / 10,
    taux_autoconsommation: Math.round(taux_autoconsommation * 100) / 100,
    energie_injectee_kwh:  Math.round(energie_injectee_kwh * 10) / 10,
    economie_devise:       Math.round(montantM5),
    cout_reseau_devise:    Math.round(montantM1),
  };
}

/**
 * Agrège les mesures pour les Tableaux Croisés Dynamiques.
 * axeLignes : 'heure' | 'jour' | 'semaine' | 'mois' | 'source' | 'periode_journee' | 'periode_climatique' | 'saison'
 */
export async function getTCDAggregation(
  siteId: string,
  dateDebut: string,
  dateFin: string,
  axeLignes: string,
  sources?: SourceCode[],
): Promise<LigneTCD[]> {
  // Colonnes disponibles dans la vue
  const axeMap: Record<string, string> = {
    heure:             'heure_decimal',
    jour:              'jour_semaine',
    mois:              'mois_nom',
    source:            'source_code',
    periode_journee:   'periode_journee',
    periode_climatique:'periode_climatique',
    saison:            'saison',
    tranche:           'tranche_tarification',
  };

  const colDimension = axeMap[axeLignes] ?? 'mois_nom';

  let query = supabase
    .from('iot_mesures_enrichies')
    .select(`${colDimension}, kwh_total, kw_total`)
    .eq('iot_site_id', siteId)
    .gte('timestamp', `${dateDebut}T00:00:00Z`)
    .lte('timestamp', `${dateFin}T23:59:59Z`);

  if (sources?.length) {
    query = query.in('source_code', sources);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Agrégation côté client (évite les RPC complexes)
  const map = new Map<string, { kwh: number; kw: number[]; count: number }>();

  for (const row of data || []) {
    const dim = String(row[colDimension] ?? 'N/A');
    const existing = map.get(dim) ?? { kwh: 0, kw: [], count: 0 };
    existing.kwh += row.kwh_total ?? 0;
    existing.kw.push(row.kw_total ?? 0);
    existing.count += 1;
    map.set(dim, existing);
  }

  return Array.from(map.entries()).map(([dimension, val]) => ({
    dimension,
    kwh_total:    Math.round(val.kwh * 100) / 100,
    kw_moyen:     val.kw.length ? Math.round((val.kw.reduce((a, b) => a + b, 0) / val.kw.length) * 100) / 100 : 0,
    kw_max:       val.kw.length ? Math.round(Math.max(...val.kw) * 100) / 100 : 0,
    kw_min:       val.kw.length ? Math.round(Math.min(...val.kw) * 100) / 100 : 0,
    montant_devise: 0, // calculé séparément si tarif disponible
  }));
}

/**
 * Récupère les dernières N lectures en temps réel (pour le dashboard live).
 */
export async function getDernieresLectures(
  siteId: string,
  limit: number = 10,
): Promise<IotReading[]> {
  const { data, error } = await supabase
    .from('iot_mesures_enrichies')
    .select('*')
    .eq('iot_site_id', siteId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as IotReading[];
}

/**
 * Vérifie si des données arrivent bien en temps réel (dernière lecture < 5 min).
 */
export async function getStatutFlux(siteId: string): Promise<{
  actif: boolean;
  derniere_lecture: string | null;
  nb_appareils: number;
}> {
  const { data, error } = await supabase
    .from('iot_readings')
    .select('timestamp, device_id')
    .eq('iot_site_id', siteId)
    .gte('timestamp', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false })
    .limit(50);

  if (error) throw error;

  const lectures = data || [];
  const appareils = new Set(lectures.map(r => r.device_id));

  return {
    actif:           lectures.length > 0,
    derniere_lecture: lectures[0]?.timestamp ?? null,
    nb_appareils:    appareils.size,
  };
}
