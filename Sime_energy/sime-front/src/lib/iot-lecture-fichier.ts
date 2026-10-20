// ============================================================
// IOT — Lecture d'un fichier quelconque (hors formats Shelly connus)
//
// Avant (19/10) : un fichier non Shelly était forcé dans le modèle
// électrique — une seule colonne, multipliée par 1 000 et appelée
// « Consommation totale » ; l'en-tête était toujours la 1re ligne (CA 8335 :
// 91 colonnes sur 95 perdues, Sunny Portal : « sep= / col_1 ») et les
// unités ignorées (Wh lus comme des kWh).
//
// Ici : on trouve l'en-tête (et la ligne d'unités) juste au-dessus des
// premières lignes de données, on garde toutes les colonnes, et chaque
// colonne numérique devient une grandeur avec son unité. L'énergie n'est
// qu'un rôle parmi d'autres, converti selon l'unité. La « lecture » (date,
// heure, ordre jour/mois, rôle et unité de chaque colonne) est enregistrée
// avec le fichier : l'Analyse la rejoue sans rien redemander.
//
// Les heuristiques de colonnes viennent du module Mesures
// (custom-sensor-service : suggestMapping, unités, ordre des dates).
// ============================================================

import type { ShellyRow, JourFerie, LectureFichier, LectureColonne, RoleColonne } from '@/components/iot/shared';
import { parseShellyRow } from './iot-profil-engine';
import { desempilerSections } from './tableau-sections';
import {
  suggestMapping, isNumericColumn, hasAnyValue, isConstantColumn,
  unitFromHeader, unitFromName, inferDayFirst,
} from './custom-sensor-service';

// ── Cellules ─────────────────────────────────────────────────

const DATE_RE = /^\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;
const NUM_RE = /^-?\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
const INDEX_COL_RE = /^(no\.?|n°|#|index|idx|id|row|ligne|num(?:ero)?)$/i;
const UNIT_TOKEN_RE = /^(%|%rh|°c|°f|℃|℉|°|v|a|w|kw|mw|wh|kwh|mwh|va|kva|var|kvar|varh|kvarh|hz|ppm|ppb|lux|hpa|pa|bar|db|dba|db\(a\)|mm|m\/s|km\/h|s|min|h|ug\/m³|µg\/m³|ug\/m3|µg\/m3|mg\/m³|l|m³|m3|dbm|pf|cos ?φ|thd|%thd)$/i;

const vide = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
const estDate = (v: unknown) => v instanceof Date || (typeof v === 'string' && DATE_RE.test(v));
const estNombre = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && NUM_RE.test(v.trim()));

export function versNombre(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!NUM_RE.test(t)) return null;
  const n = Number(t.replace(/[ \u00a0]/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

/** Ligne de données : au moins une date et au moins un nombre. */
function estLigneDonnees(r: unknown[]): boolean {
  return r.some(estDate) && r.some(c => !(c instanceof Date) && estNombre(c));
}

/** Ligne d'unités sous l'en-tête : cellules courtes, sans nombre ni date, au moins une unité connue. */
function estLigneUnites(r: unknown[]): boolean {
  const pleines = r.filter(c => !vide(c)).map(c => String(c).trim());
  if (pleines.length === 0) return false;
  if (pleines.some(c => c.length > 10 || estNombre(c) || estDate(c))) return false;
  // Uniquement des unités : « Temps, Wh » est un en-tête, pas une ligne d'unités
  return pleines.every(c => UNIT_TOKEN_RE.test(c));
}

// ── 1. Tableau : en-tête, unités, lignes ─────────────────────

export interface TableauLu {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Unités lues sur une ligne d'unités (CA 8335 : « Hz », « V » sous l'en-tête). */
  unites: Record<string, string>;
  /** Lignes au-dessus de l'en-tête (nom de l'appareil, numéro de série…). */
  preambule: string[];
}

/**
 * L'en-tête est la ligne juste au-dessus des premières lignes de données
 * (une ligne d'unités pouvant s'intercaler), pas forcément la 1re ligne :
 * les exports d'appareils commencent souvent par un préambule.
 */
export function lireTableau(brut: unknown[][]): TableauLu {
  const lignes = brut.filter(r => Array.isArray(r) && r.some(c => !vide(c)));
  if (lignes.length === 0) return { columns: [], rows: [], unites: {}, preambule: [] };

  // Première ligne de données suivie d'au moins deux autres (ou la fin du fichier)
  let debut = -1;
  for (let i = 0; i < lignes.length; i++) {
    if (!estLigneDonnees(lignes[i])) continue;
    const suite = lignes.slice(i + 1, i + 3);
    if (suite.every(estLigneDonnees)) { debut = i; break; }
  }

  let iEntete = 0;
  let ligneUnites: unknown[] | null = null;
  if (debut > 0) {
    let j = debut - 1;
    if (j > 0 && estLigneUnites(lignes[j])) { ligneUnites = lignes[j]; j--; }
    iEntete = j;
  } else if (debut === 0) {
    iEntete = -1; // pas d'en-tête : colonnes nommées col_1…
  }

  const donnees = lignes.slice(iEntete + 1 + (ligneUnites ? 1 : 0));
  const largeur = Math.max(
    iEntete >= 0 ? lignes[iEntete].length : 0,
    ...donnees.slice(0, 500).map(r => r.length),
  );

  const entete = iEntete >= 0 ? lignes[iEntete] : [];
  const vus = new Map<string, number>();
  const columns: string[] = [];
  for (let k = 0; k < largeur; k++) {
    let nom = vide(entete[k]) ? `col_${k + 1}` : String(entete[k]).replace(/[\uFEFF\u200B]/g, '').trim();
    const n = vus.get(nom) ?? 0;
    vus.set(nom, n + 1);
    if (n > 0) nom = `${nom} (${n + 1})`;
    columns.push(nom);
  }

  const unites: Record<string, string> = {};
  if (ligneUnites) columns.forEach((c, k) => { if (!vide(ligneUnites![k])) unites[c] = String(ligneUnites![k]).trim(); });

  const rows = donnees.map(r => {
    const o: Record<string, unknown> = {};
    columns.forEach((c, k) => { o[c] = r[k] ?? null; });
    return o;
  });

  const preambule = lignes.slice(0, Math.max(0, iEntete))
    .map(r => r.filter(c => !vide(c)).map(c => String(c).trim()).join(' '));
  return { columns, rows, unites, preambule };
}

// ── 2. Proposition de lecture ────────────────────────────────

const UNITES_ENERGIE: Record<string, number> = { wh: 1, kwh: 1000, mwh: 1e6, varh: 1, kvarh: 1000, vah: 1, kvah: 1000 };
const UNITES_PUISSANCE: Record<string, number> = { w: 0.001, kw: 1, mw: 1000 };

function libelleDe(col: string): string {
  const base = col.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').replace(/_+/g, ' ').trim();
  return base || col;
}

/** Compteur cumulatif : valeurs croissantes et grandes devant leurs écarts (index d'énergie). */
function estCumulatif(valeurs: number[]): boolean {
  if (valeurs.length < 5) return false;
  let hausses = 0, baisses = 0;
  const ecarts: number[] = [];
  for (let i = 1; i < valeurs.length; i++) {
    const d = valeurs[i] - valeurs[i - 1];
    if (d > 0) hausses++; else if (d < 0) baisses++;
    if (d > 0) ecarts.push(d);
  }
  if (hausses === 0 || baisses > (valeurs.length - 1) * 0.02) return false;
  ecarts.sort((a, b) => a - b);
  const ecartMedian = ecarts[Math.floor(ecarts.length / 2)];
  const valMediane = [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)];
  return valMediane > ecartMedian * 20;
}

/** Lignes qui portent une date dans la colonne choisie — les marqueurs de section en sont exclus. */
function lignesDatees(rows: Record<string, unknown>[], colDate: string) {
  return rows.filter(r => estDate(r[colDate]));
}

export function proposerLecture(
  columns: string[],
  rows: Record<string, unknown>[],
  unites: Record<string, string>,
  preambule: string[],
  nomFichier: string,
): LectureFichier {
  const echantillon = rows.filter(r => Object.values(r).some(estDate)).slice(0, 400);
  const meta: Record<string, string> = preambule.length ? { _lines: preambule.join('\n') } : {};
  const s = suggestMapping(columns, echantillon, meta, nomFichier);
  const colDate = s.timestampCol;
  const colHeure = s.timeCol;

  const textes = lignesDatees(echantillon, colDate).map(r => {
    const d = r[colDate];
    return d instanceof Date ? d.toISOString() : String(d ?? '');
  });
  const ordre = inferDayFirst(textes);

  const datees = lignesDatees(echantillon, colDate);
  const colonnes: LectureColonne[] = [];
  let puissanceChoisie = false;
  const candidates = columns.filter(c => c !== colDate && c !== colHeure);
  // Colonne « total » en priorité pour l'énergie et la puissance (CA 8335 : P1, P2, P3, P total)
  const estTotal = (c: string) => /total|tot\b|σ|sum|somme|global/i.test(c);
  const ordreRole = [...candidates].sort((a, b) => Number(estTotal(b)) - Number(estTotal(a)));

  const roles = new Map<string, { role: RoleColonne; cumul: boolean; unite: string; motif?: string; phase?: 'A' | 'B' | 'C' }>();
  // Une colonne d'énergie appartient à une phase ou au total selon son nom
  // (« Phase A (Wh) », « Retour Phase C (Wh) », « Wh1 », « Total (Wh) »)
  const phaseDe = (c: string): 'A' | 'B' | 'C' | undefined => {
    const m = c.match(/phase\s*([abc123])\b|\bL([123])\b|^(?:k?wh|e)\s*([123abc])$/i) ?? c.match(/\b(?:ph\.?|p)\s*([abc])\b/i);
    const x = (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4])?.toUpperCase();
    return x === 'A' || x === '1' ? 'A' : x === 'B' || x === '2' ? 'B' : x === 'C' || x === '3' ? 'C' : undefined;
  };
  const partiesEnergie = new Set<string>(); // « total », « A », « retour|B »… déjà attribués
  for (const c of ordreRole) {
    const unite = unites[c] || unitFromHeader(c) || unitFromName(c);
    const u = unite.toLowerCase();
    if (INDEX_COL_RE.test(c.trim())) { roles.set(c, { role: 'ignorer', cumul: false, unite, motif: 'numéro de ligne' }); continue; }
    if (!hasAnyValue(datees, c)) { roles.set(c, { role: 'ignorer', cumul: false, unite, motif: 'vide' }); continue; }
    if (!isNumericColumn(datees, c)) { roles.set(c, { role: 'ignorer', cumul: false, unite, motif: 'texte' }); continue; }
    if (isConstantColumn(datees, c) && !(u in UNITES_ENERGIE)) { roles.set(c, { role: 'ignorer', cumul: false, unite, motif: 'valeur constante' }); continue; }
    const vals = datees.map(r => versNombre(r[c])).filter((v): v is number => v !== null);
    if (u in UNITES_ENERGIE && /^(k|m)?wh$/.test(u)) {
      const retour = /retour|inject|export|feed|vente/i.test(c);
      const phase = phaseDe(c);
      const partie = `${retour ? 'retour' : 'conso'}|${phase ?? 'total'}`;
      if (!partiesEnergie.has(partie)) {
        partiesEnergie.add(partie);
        roles.set(c, { role: retour ? 'retour' : 'energie', cumul: estCumulatif(vals), unite, phase });
        continue;
      }
    }
    if (u in UNITES_PUISSANCE && !puissanceChoisie) {
      roles.set(c, { role: 'puissance', cumul: false, unite });
      puissanceChoisie = true;
      continue;
    }
    roles.set(c, { role: 'grandeur', cumul: false, unite });
  }
  for (const c of candidates) {
    const r = roles.get(c)!;
    colonnes.push({ col: c, libelle: libelleDe(c), unite: r.unite, role: r.role, cumul: r.cumul || undefined, motif: r.motif, phase: r.phase });
  }

  const indices = `${nomFichier} ${preambule.join(' ')} ${columns.join(' ')}`;
  return {
    version: 1,
    sens: /\bpv\b|solaire|photovolta|production|onduleur|inverter|sunny|solaredge|fronius|huawei/i.test(indices) ? 'production' : 'consommation',
    colDate,
    colHeure,
    ordreDates: ordre === 'iso' ? 'iso' : ordre === true ? 'jma' : ordre === false ? 'mja' : 'jma',
    colonnes,
  };
}

// ── 3. Application : lignes ShellyRow ────────────────────────

function heureDe(v: unknown): [number, number, number] | null {
  if (v instanceof Date) return [v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()];
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const s = Math.round(v * 86400);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? [+m[1], +m[2], +(m[3] ?? 0)] : null;
}

/**
 * Date « heure murale » : un xlsx donne des Date dont les composantes UTC
 * sont l'heure affichée dans Excel ; un texte est lu tel qu'écrit.
 */
export function lireDate(v: unknown, heure: unknown, ordre: LectureFichier['ordreDates']): Date | null {
  let y: number, mo: number, d: number, h = 0, mi = 0, s = 0;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    y = v.getUTCFullYear(); mo = v.getUTCMonth() + 1; d = v.getUTCDate();
    h = v.getUTCHours(); mi = v.getUTCMinutes(); s = v.getUTCSeconds();
  } else {
    const t = String(v ?? '').trim();
    const m = t.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (ordre === 'mja') { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    if (y < 100) y += 2000;
    h = +(m[4] ?? 0); mi = +(m[5] ?? 0); s = +(m[6] ?? 0);
  }
  if (heure !== undefined && heure !== null && heure !== '') {
    const hh = heureDe(heure);
    if (hh) [h, mi, s] = hh;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  return isNaN(date.getTime()) ? null : date;
}

/** Clé d'une grandeur : « PM2.5 (ug/m³) » — libellé et unité, comme dans les menus. */
export function cleGrandeur(c: Pick<LectureColonne, 'libelle' | 'unite'>): string {
  return c.unite ? `${c.libelle} (${c.unite})` : c.libelle;
}

export interface ResultatLecture {
  rows: ShellyRow[];
  dateIllisibles: number;
  /** Pas médian entre deux relevés, en secondes. */
  pasSecondes: number | null;
  /** Énergie calculée depuis la puissance (pas de colonne d'énergie). */
  energieDeduite: boolean;
}

export function appliquerLecture(
  rows: Record<string, unknown>[],
  lecture: LectureFichier,
  joursFerier: JourFerie[],
  ident: { nom?: string; lieu?: string; piece?: string } = {},
): ResultatLecture {
  const actives = lecture.colonnes.filter(c => c.role !== 'ignorer');
  const energie = actives.filter(c => c.role === 'energie');
  const retour = actives.filter(c => c.role === 'retour');
  const puissance = actives.find(c => c.role === 'puissance');
  const grandeurs = actives.filter(c => c.role === 'grandeur');

  // Lecture des lignes ; un texte à la place de la date marque une section
  // (export Shelly Cloud : « Consommation » puis « Retour Total »)
  // Énergie rangée par appartenance : total ou phase, consommation ou retour
  type Parts = { total: number | null; A: number; B: number; C: number };
  type Acc = { date: Date; c: Parts; r: Parts; kw: number | null; g: Record<string, number> };
  const parts = (): Parts => ({ total: null, A: 0, B: 0, C: 0 });
  const ajouter = (p: Parts, phase: LectureColonne['phase'], wh: number) => {
    if (phase) p[phase] += wh; else p.total = (p.total ?? 0) + wh;
  };
  const totalDe = (p: Parts) => p.total ?? p.A + p.B + p.C;
  const parTs = new Map<number, Acc>();
  let section: 'conso' | 'retour' = 'conso';
  let illisibles = 0;
  const precedent = new Map<string, number>(); // dernier index des colonnes cumulatives

  const facteurWh = (c: LectureColonne) => UNITES_ENERGIE[c.unite.toLowerCase()] ?? 1;
  const facteurKw = (c: LectureColonne) => UNITES_PUISSANCE[c.unite.toLowerCase()] ?? 1;
  const valeur = (r: Record<string, unknown>, c: LectureColonne): number | null => {
    const v = versNombre(r[c.col]);
    if (v === null || !c.cumul) return v;
    const cle = `${section}|${c.col}`;
    const p = precedent.get(cle);
    precedent.set(cle, v);
    return p === undefined ? null : Math.max(0, v - p);
  };

  for (const r of rows) {
    const date = lireDate(r[lecture.colDate], lecture.colHeure ? r[lecture.colHeure] : undefined, lecture.ordreDates);
    if (!date) {
      const t = String(r[lecture.colDate] ?? '').trim();
      if (/retour|inject|export/i.test(t)) section = 'retour';
      else if (/consomm|import|soutir/i.test(t)) section = 'conso';
      else if (t && !/^(temps|date|time|heure)/i.test(t)) illisibles++;
      continue;
    }
    const ts = date.getTime();
    const acc = parTs.get(ts) ?? { date, c: parts(), r: parts(), kw: null, g: {} };
    for (const c of energie) {
      const v = valeur(r, c);
      if (v === null) continue;
      ajouter(section === 'retour' ? acc.r : acc.c, c.phase, Math.abs(v) * facteurWh(c));
    }
    for (const c of retour) {
      const v = valeur(r, c);
      if (v !== null) ajouter(acc.r, c.phase, Math.abs(v) * facteurWh(c));
    }
    if (puissance && section === 'conso') {
      const v = versNombre(r[puissance.col]);
      if (v !== null) acc.kw = v * facteurKw(puissance);
    }
    for (const c of grandeurs) {
      const v = versNombre(r[c.col]);
      if (v !== null) acc.g[cleGrandeur(c)] = v;
    }
    parTs.set(ts, acc);
  }

  const accs = [...parTs.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const pas: number[] = [];
  for (let i = 1; i < accs.length; i++) pas.push((accs[i].date.getTime() - accs[i - 1].date.getTime()) / 1000);
  pas.sort((a, b) => a - b);
  const pasSecondes = pas.length ? pas[Math.floor(pas.length / 2)] : null;
  const pasHeures = pasSecondes ? pasSecondes / 3600 : 1;

  // Puissance seule (Sunny Portal : kW au quart d'heure) → énergie = P × pas
  const energieDeduite = energie.length === 0 && retour.length === 0 && !!puissance;
  // Production : l'énergie SORT de l'installation — rangée comme le PV des
  // sites (injection d'un compteur de rôle M5_PV, cf. fluxDe)
  const production = lecture.sens === 'production';

  const out: ShellyRow[] = [];
  for (const a of accs) {
    let wh = totalDe(a.c);
    const whR = totalDe(a.r);
    if (energieDeduite && a.kw !== null) wh = Math.max(0, a.kw) * pasHeures * 1000;
    const base = parseShellyRow({
      Temps: a.date,
      Wh_Total: production ? 0 : wh,
      'Wh_Phase A': production ? 0 : a.c.A, 'Wh_Phase B': production ? 0 : a.c.B, 'Wh_Phase C': production ? 0 : a.c.C,
      'Wh_Retour Total': production ? wh + whR : whR,
      'Wh_Retour Ph. A': a.r.A, 'Wh_Retour Ph. B': a.r.B, 'Wh_Retour Ph. C': a.r.C,
      Appareil: ident.nom,
      Site: ident.lieu,
      Piece: ident.piece,
    }, joursFerier);
    if (!base) continue;
    const kw = a.kw ?? (energie.length ? base.kwhTotal / pasHeures : 0);
    out.push({
      ...base,
      ...(production ? { role: 'M5_PV' } : {}),
      puissKwA: base.kwhA / pasHeures, puissKwB: base.kwhB / pasHeures, puissKwC: base.kwhC / pasHeures,
      puissKwTotal: production ? 0 : kw,
      puissKwRetourA: base.kwhRetourA / pasHeures, puissKwRetourB: base.kwhRetourB / pasHeures, puissKwRetourC: base.kwhRetourC / pasHeures,
      puissKwRetourTotal: production && a.kw !== null ? Math.max(0, a.kw) : base.kwhRetourTotal / pasHeures,
      grandeurs: Object.keys(a.g).length ? a.g : undefined,
    });
  }
  return { rows: out, dateIllisibles: illisibles, pasSecondes, energieDeduite };
}

// ── 4. Fichier importé → lignes ──────────────────────────────

/**
 * Lignes d'un fichier importé, prêtes pour l'Analyse et le Nettoyage. Un
 * fichier importé avant le 19/10 peut avoir gardé ses sections EMPILÉES
 * (Phase A, Phase B… sous une même colonne « Wh ») : on le réorganise en
 * une colonne par section et on refait sa lecture, sans réimport.
 */
export function lireFichierImporte(
  f: { name: string; columns: string[]; rawData: Record<string, unknown>[]; lecture?: LectureFichier; deviceLocation?: string; deviceRoom?: string },
  joursFerier: JourFerie[],
): ResultatLecture | null {
  const ident = { nom: f.name.replace(/\.(csv|xlsx|xls)$/i, ''), lieu: f.deviceLocation, piece: f.deviceRoom };
  const d = desempilerSections([f.columns, ...f.rawData.map(r => f.columns.map(c => r[c]))]);
  if (d) {
    const t = lireTableau(d.rows);
    const lecture = { ...proposerLecture(t.columns, t.rows, t.unites, [], f.name), ...(f.lecture?.sens ? { sens: f.lecture.sens } : {}) };
    return appliquerLecture(t.rows, lecture, joursFerier, ident);
  }
  if (f.lecture) return appliquerLecture(f.rawData, f.lecture, joursFerier, ident);
  return null;
}
