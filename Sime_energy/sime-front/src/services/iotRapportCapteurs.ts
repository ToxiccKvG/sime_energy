/**
 * Analyses du rapport pour tout ce qui n'est pas de l'énergie : ambiance, météo,
 * états, grandeurs de fichiers, santé des capteurs.
 *
 * Fonctions pures, sans écran ni base. Règles :
 *  - chaque grandeur est résumée selon sa nature : on additionne une pluie, on
 *    fait la moyenne d'une température ;
 *  - jamais de moyenne entre capteurs ni entre sites : une ligne par capteur ;
 *  - une mesure absente reste absente, jamais 0 ;
 *  - aucun seuil de confort ou d'alerte : le rapport décrit les mesures ;
 *  - un constat n'est écrit que si les données suffisent.
 * Toutes les heures sont en UTC, qui est l'heure de Dakar.
 */

import type { ShellyRow } from '@/components/iot/shared';
import type { EtatAppareil, LigneCapteur } from '@/lib/iot-rapport-service';
import type { Tableau } from './iotRapport';
import type { TranchesHoraires } from './iotRapportAnalyses';

export type NatureGrandeur = 'moyenne' | 'cumul';

export interface DefGrandeur { cle: string; libelle: string; unite: string; nature: NatureGrandeur }

/** Ordre d'affichage du rapport. La pile et le signal sont dans la feuille Santé. */
export const GRANDEURS: DefGrandeur[] = [
  { cle: 'temperature', libelle: 'Température', unite: '°C', nature: 'moyenne' },
  { cle: 'humidite', libelle: 'Humidité', unite: '%', nature: 'moyenne' },
  { cle: 'ressenti', libelle: 'Ressenti', unite: '°C', nature: 'moyenne' },
  { cle: 'point_rosee', libelle: 'Point de rosée', unite: '°C', nature: 'moyenne' },
  { cle: 'pluie_mm', libelle: 'Pluie', unite: 'mm', nature: 'cumul' },
  { cle: 'vent', libelle: 'Vent', unite: 'm/s', nature: 'moyenne' },
  { cle: 'rafale', libelle: 'Rafale', unite: 'm/s', nature: 'moyenne' },
  { cle: 'uv', libelle: 'Indice UV', unite: '', nature: 'moyenne' },
  { cle: 'lux', libelle: 'Luminosité', unite: 'lux', nature: 'moyenne' },
  { cle: 'pression', libelle: 'Pression', unite: 'hPa', nature: 'moyenne' },
  { cle: 'inclinaison', libelle: 'Inclinaison', unite: '°', nature: 'moyenne' },
  { cle: 'gaz_ppm', libelle: 'Concentration de gaz', unite: 'ppm', nature: 'moyenne' },
];

/** Valeurs de la colonne min/max horaire, quand la collecte les garde. */
const BORNES: Record<string, { min?: string; max?: string }> = {
  temperature: { min: 'temperature_min', max: 'temperature_max' },
  uv: { max: 'uv_max' },
  lux: { max: 'lux_max' },
  rafale: { max: 'rafale' },
};

/** État « actif » de chaque capteur d'état : ce qu'on compte, et comment on le nomme. */
const ETATS_ACTIFS: { etat: string; action: string; duree: string }[] = [
  { etat: 'open', action: 'Ouvertures', duree: 'Durée ouverte' },
  { etat: 'motion', action: 'Détections', duree: 'Durée en détection' },
  { etat: 'pressed', action: 'Appuis', duree: 'Durée appuyée' },
  { etat: 'single_push', action: 'Appuis', duree: 'Durée appuyée' },
  { etat: 'on', action: 'Allumages', duree: 'Durée allumée' },
];

export interface CourbeCapteur { libelle: string; valeurs: (number | null)[] }

export interface VueGrandeur {
  def: DefGrandeur;
  capteurs: string[];
  /** Min, moyenne et max du jour, ou total pour une pluie : une colonne par capteur. */
  parJour: Tableau;
  /** Journée type : une colonne par capteur. Sans objet pour un cumul. */
  profil24: Tableau | null;
  carte: { titre: string; jours: string[]; matrice: (number | null)[][] } | null;
}

export interface RapportCapteurs {
  /** Résumé : « 6 capteurs d'ambiance, 7 capteurs d'état ». */
  resume: string;
  nbSites: number;
  grandeurs: Tableau | null;
  vues: VueGrandeur[];
  etats: Tableau | null;
  etatsParHeure: Tableau | null;
  etatsParJour: Tableau | null;
  sante: Tableau;
  nonClasses: string[];
  croisements: Tableau | null;
  constats: string[];
  aVerifierAuto: string[];
}

export interface EntreeCapteurs {
  lignes: LigneCapteur[];
  etats: EtatAppareil[] | null;
  tranches: TranchesHoraires;
  debut?: string;
  fin?: string;
  heureDebut?: number;
  heureFin?: number;
  /** Énergie de la série principale par jour et par site, pour les croisements. */
  energieParJourEtSite?: Map<string, Map<string, number>> | null;
  maintenant?: Date;
}

// ── Utilitaires ──────────────────────────────────────────────
const nf = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const cleUtc = (d: Date) => d.toISOString().slice(0, 10);
const jjmm = (cle: string) => `${cle.slice(8, 10)}/${cle.slice(5, 7)}`;
const instant = (d: Date) => `${jjmm(cleUtc(d))} à ${String(d.getUTCHours()).padStart(2, '0')} h`;
const libelleHeure = (h: number) => `${String(h).padStart(2, '0')} h`;
const moyenne = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const dansPlage = (h: number, debut: number, fin: number) => (debut <= fin ? h >= debut && h < fin : h >= debut || h < fin);
const uneValeur = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Grandeurs d'un fichier importé : clé « libellé (unité) », résumées en moyenne. */
function defGrandeurFichier(cle: string): DefGrandeur {
  const m = cle.match(/^(.*?)\s*\(([^()]*)\)$/);
  return { cle, libelle: m ? m[1] : cle, unite: m ? m[2] : '', nature: 'moyenne' };
}

const CHAMPS_FICHIER: Record<string, keyof ShellyRow> = {
  temperature: 'temperature', humidite: 'humidite', ressenti: 'ressenti', point_rosee: 'pointRosee',
  vent: 'ventVitesse', rafale: 'ventRafale', uv: 'uvIndex', lux: 'luminosite', pression: 'pression',
  inclinaison: 'angleInclinaison', gaz_ppm: 'concentrationGaz', batterie: 'batterie', signal: 'signal',
  pluie_mm: 'precipitationIncr',
};

/** Lignes capteurs d'un fichier importé, ramenées à l'heure : colonnes connues et colonnes libres. */
export function lignesCapteursDepuisFichier(rows: ShellyRow[]): LigneCapteur[] {
  const agr = new Map<string, { base: LigneCapteur; n: Map<string, number> }>();
  for (const r of rows) {
    const date = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
    if (Number.isNaN(date.getTime())) continue;
    const ts = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()));
    const id = r.deviceId ?? r.nomAppareil ?? 'fichier';
    const valeurs: Record<string, number> = {};
    for (const [cle, champ] of Object.entries(CHAMPS_FICHIER)) {
      const v = uneValeur(r[champ]);
      if (v != null) valeurs[cle] = v;
    }
    for (const [cle, v] of Object.entries(r.grandeurs ?? {})) if (uneValeur(v) != null) valeurs[cle] = v;
    if (Object.keys(valeurs).length === 0) continue;
    const k = `${ts.getTime()}|${id}`;
    const c = agr.get(k) ?? {
      base: { ts, site: r.deviceLocation ?? '', deviceId: id, nom: r.nomAppareil ?? id, famille: 'CAPTEUR_ENV', type: null, valeurs: {}, nbMesures: 0 },
      n: new Map<string, number>(),
    };
    for (const [cle, v] of Object.entries(valeurs)) {
      const cumul = GRANDEURS.find(g => g.cle === cle)?.nature === 'cumul';
      const nb = c.n.get(cle) ?? 0;
      const avant = c.base.valeurs[cle] ?? 0;
      c.base.valeurs[cle] = cumul ? avant + v : (avant * nb + v) / (nb + 1);
      c.n.set(cle, nb + 1);
    }
    c.base.nbMesures += 1;
    agr.set(k, c);
  }
  return [...agr.values()].map(c => c.base);
}

const NOMS_FAMILLE: Record<string, string> = { CAPTEUR_ENV: "capteur d'ambiance ou météo", ETAT: "capteur d'état" };
const pluriel = (n: number, mot: string) => {
  const m = n > 1 ? mot.replace("capteur d'", "capteurs d'").replace('appareil', 'appareils') : mot;
  return `${n} ${m}`;
};

export function construireCapteurs(e: EntreeCapteurs): RapportCapteurs | null {
  const t = e.tranches;
  const maintenant = e.maintenant ?? new Date();

  // Un appareil, sa famille : « INCONNU » seulement s'il n'a jamais été classé
  const appareils = new Map<string, { id: string; nom: string; site: string; famille: string | null; type: string | null; lignes: LigneCapteur[] }>();
  for (const l of e.lignes) {
    const a = appareils.get(l.deviceId) ?? { id: l.deviceId, nom: l.nom, site: l.site, famille: null, type: l.type, lignes: [] };
    a.nom = l.nom;
    a.site = l.site;
    if (l.famille && l.famille !== 'INCONNU') a.famille = l.famille;
    a.lignes.push(l);
    appareils.set(l.deviceId, a);
  }
  if (appareils.size === 0 && !(e.etats && e.etats.length)) return null;

  const sites = [...new Set([...appareils.values()].map(a => a.site))].sort();
  const plusieursSites = sites.length > 1;
  const nomCapteur = (a: { nom: string; site: string }) => (plusieursSites ? `${a.site} · ${a.nom}` : a.nom);
  const ordre = [...appareils.values()].sort((a, b) => a.site.localeCompare(b.site) || a.nom.localeCompare(b.nom));
  const valeursDe = (a: { lignes: LigneCapteur[] }, cle: string) =>
    a.lignes.filter(l => l.nbMesures > 0 && uneValeur(l.valeurs[cle]) != null);

  // Grandeurs présentes : connues d'abord, puis celles des fichiers
  const clesPresentes = new Set(e.lignes.flatMap(l => Object.keys(l.valeurs)));
  const defs = [
    ...GRANDEURS.filter(g => clesPresentes.has(g.cle)),
    ...[...clesPresentes].filter(c => !GRANDEURS.some(g => g.cle === c) && !['batterie', 'signal', 'temp_interne'].includes(c) && !Object.values(BORNES).some(b => b.min === c || b.max === c)).sort().map(defGrandeurFichier),
  ];
  const constats: string[] = [];
  const aVerifierAuto: string[] = [];

  // ── Synthèse : une ligne par capteur et par grandeur ────────
  const lignesSynthese: (string | number | Date | null)[][] = [];
  for (const def of defs) {
    for (const a of ordre) {
      const ls = valeursDe(a, def.cle);
      if (ls.length === 0) continue;
      const bornes = BORNES[def.cle] ?? {};
      const hauteDe = (l: LigneCapteur) => (bornes.max ? uneValeur(l.valeurs[bornes.max]) : null) ?? l.valeurs[def.cle];
      const basseDe = (l: LigneCapteur) => (bornes.min ? uneValeur(l.valeurs[bornes.min]) : null) ?? l.valeurs[def.cle];
      const haut = ls.reduce((x, l) => (hauteDe(l) > hauteDe(x) ? l : x));
      const bas = ls.reduce((x, l) => (basseDe(l) < basseDe(x) ? l : x));
      const vals = ls.map(l => l.valeurs[def.cle]);
      const jour = ls.filter(l => dansPlage(l.ts.getUTCHours(), t.jourDebut, t.jourFin)).map(l => l.valeurs[def.cle]);
      const nuit = ls.filter(l => !dansPlage(l.ts.getUTCHours(), t.jourDebut, t.jourFin)).map(l => l.valeurs[def.cle]);
      const cumul = def.nature === 'cumul';
      lignesSynthese.push([
        def.libelle, def.unite, a.site, a.nom, ls.length,
        cumul ? null : basseDe(bas), cumul ? null : bas.ts,
        hauteDe(haut), haut.ts,
        cumul ? null : moyenne(vals), cumul ? vals.reduce((s, v) => s + v, 0) : null,
        cumul ? null : moyenne(jour), cumul ? null : moyenne(nuit),
      ]);
    }
  }
  const grandeurs: Tableau | null = lignesSynthese.length ? {
    note: 'Une ligne par capteur : on ne fait jamais la moyenne de deux capteurs. Une pluie se lit en total, le reste en moyenne. Le maximum d’une pluie est l’heure la plus pluvieuse. Heures locales de Dakar.',
    colonnes: [
      { titre: 'Grandeur', format: 'texte' }, { titre: 'Unité', format: 'texte' }, { titre: 'Site', format: 'texte' }, { titre: 'Capteur', format: 'texte' },
      { titre: 'Heures mesurées', format: 'nombre' }, { titre: 'Minimum', format: 'decimal' }, { titre: 'Date du minimum', format: 'dateheure' },
      { titre: 'Maximum', format: 'decimal' }, { titre: 'Date du maximum', format: 'dateheure' }, { titre: 'Moyenne', format: 'decimal' }, { titre: 'Total', format: 'decimal' },
      { titre: `Moyenne jour (${t.jourDebut} h–${t.jourFin} h)`, format: 'decimal' }, { titre: `Moyenne nuit (${t.jourFin} h–${t.jourDebut} h)`, format: 'decimal' },
    ],
    lignes: lignesSynthese,
  } : null;

  // ── Par grandeur : par jour, journée type, carte ────────────
  const jours = [...new Set(e.lignes.filter(l => l.nbMesures > 0).map(l => cleUtc(l.ts)))].sort();
  const vues: VueGrandeur[] = defs.map(def => {
    const avec = ordre.filter(a => valeursDe(a, def.cle).length > 0);
    const cumul = def.nature === 'cumul';
    const parJourMap = new Map<string, Map<string, number[]>>();
    for (const a of avec) {
      const m = new Map<string, number[]>();
      for (const l of valeursDe(a, def.cle)) m.set(cleUtc(l.ts), [...(m.get(cleUtc(l.ts)) ?? []), l.valeurs[def.cle]]);
      parJourMap.set(a.id, m);
    }
    const parJour: Tableau = {
      colonnes: [
        { titre: 'Jour', format: 'texte' },
        ...avec.map(a => ({ titre: `${nomCapteur(a)} (${cumul ? 'total' : 'moyenne'}${def.unite ? `, ${def.unite}` : ''})`, format: 'decimal' as const })),
      ],
      lignes: jours.map(j => [jjmm(j), ...avec.map(a => {
        const v = parJourMap.get(a.id)?.get(j);
        return !v ? null : cumul ? v.reduce((s, x) => s + x, 0) : moyenne(v);
      })]),
    };
    let profil24: Tableau | null = null;
    if (!cumul) {
      profil24 = {
        colonnes: [{ titre: 'Heure', format: 'texte' }, ...avec.map(a => ({ titre: `${nomCapteur(a)}${def.unite ? ` (${def.unite})` : ''}`, format: 'decimal' as const }))],
        lignes: Array.from({ length: 24 }, (_, h) => [libelleHeure(h), ...avec.map(a =>
          moyenne(valeursDe(a, def.cle).filter(l => l.ts.getUTCHours() === h).map(l => l.valeurs[def.cle])))]),
      };
    }
    // Carte de chaleur : le capteur le plus complet de cette grandeur
    const plein = [...avec].sort((x, y) => valeursDe(y, def.cle).length - valeursDe(x, def.cle).length)[0];
    let carte: VueGrandeur['carte'] = null;
    if (plein && jours.length > 0) {
      const index = new Map(jours.map((j, i) => [j, i]));
      const matrice: (number | null)[][] = Array.from({ length: 24 }, () => jours.map(() => null));
      for (const l of valeursDe(plein, def.cle)) matrice[l.ts.getUTCHours()][index.get(cleUtc(l.ts))!] = l.valeurs[def.cle];
      carte = { titre: `${def.libelle}${def.unite ? ` (${def.unite})` : ''} — ${nomCapteur(plein)}`, jours, matrice };
    }
    return { def, capteurs: avec.map(nomCapteur), parJour, profil24, carte };
  });

  // ── États ───────────────────────────────────────────────────
  const etats = e.etats ?? [];
  const parAppareilEtat = new Map<string, EtatAppareil[]>();
  for (const x of etats) parAppareilEtat.set(x.device_id, [...(parAppareilEtat.get(x.device_id) ?? []), x]);
  const actifDe = (l: EtatAppareil[]) => {
    for (const def of ETATS_ACTIFS) {
      const x = l.find(y => y.etat === def.etat);
      if (x) return { def, x };
    }
    return null;
  };
  const lignesEtats: (string | number | null)[][] = [];
  const heuresEtat: { nom: string; h: number[] }[] = [];
  const joursEtat: { nom: string; j: Record<string, number> }[] = [];
  for (const [id, liste] of parAppareilEtat) {
    const a = appareils.get(id);
    const nom = a?.nom ?? id;
    const actif = actifDe(liste);
    const total = liste.reduce((s, x) => s + x.duree_s, 0);
    const inconnu = liste.reduce((s, x) => s + x.duree_inconnue_s, 0);
    if (actif) {
      if (actif.x.nb_entrees === 0 && total > 0 && actif.x.duree_s / total > 0.95 && actif.def.etat === 'open') {
        aVerifierAuto.push(`${a ? nomCapteur(a) : nom} : indique « ouvert » toute la période, sans aucun changement. Vraiment ouvert, ou capteur bloqué ?`);
      }
      lignesEtats.push([
        a?.site ?? '', nom, actif.def.action, actif.x.nb_entrees, actif.def.duree, actif.x.duree_s / 3600,
        total > 0 ? actif.x.duree_s / total : null, inconnu / 3600,
      ]);
      const libelle = `${a ? nomCapteur(a) : nom} — ${actif.def.action.toLowerCase()}`;
      heuresEtat.push({ nom: libelle, h: actif.x.par_heure });
      joursEtat.push({ nom: libelle, j: actif.x.par_jour });
    } else {
      // Un seul état connu, ou des états qu'on ne sait pas nommer : on les liste tels quels
      const noms = liste.map(x => x.etat).join(', ');
      lignesEtats.push([a?.site ?? '', nom, `Aucun changement utile (état : ${noms})`, liste.reduce((s, x) => s + x.nb_entrees, 0), '', null, null, inconnu / 3600]);
    }
  }
  lignesEtats.sort((x, y) => String(x[0]).localeCompare(String(y[0])) || String(x[1]).localeCompare(String(y[1])));
  const etatsTableau: Tableau | null = lignesEtats.length ? {
    note: 'Compté sur les relevés bruts. Les écarts de plus de 15 minutes sans relevé ne sont pas comptés dans les durées : ils sont donnés à part. Un relais donne une durée allumée, pas une énergie.',
    colonnes: [
      { titre: 'Site', format: 'texte' }, { titre: 'Capteur', format: 'texte' }, { titre: 'Ce qui est compté', format: 'texte' }, { titre: 'Nombre', format: 'nombre' },
      { titre: 'Durée de quoi', format: 'texte' }, { titre: 'Durée (h)', format: 'decimal' }, { titre: 'Part du temps connu', format: 'pct' }, { titre: 'Temps sans relevé (h)', format: 'decimal' },
    ],
    lignes: lignesEtats,
  } : null;
  const etatsParHeure: Tableau | null = heuresEtat.length ? {
    colonnes: [{ titre: 'Heure', format: 'texte' }, ...heuresEtat.map(x => ({ titre: x.nom, format: 'nombre' as const }))],
    lignes: Array.from({ length: 24 }, (_, h) => [libelleHeure(h), ...heuresEtat.map(x => x.h[h] ?? 0)]),
  } : null;
  const joursEtats = [...new Set(joursEtat.flatMap(x => Object.keys(x.j)))].sort();
  const etatsParJour: Tableau | null = joursEtat.length && joursEtats.length ? {
    colonnes: [{ titre: 'Jour', format: 'texte' }, ...joursEtat.map(x => ({ titre: x.nom, format: 'nombre' as const }))],
    lignes: joursEtats.map(j => [jjmm(j), ...joursEtat.map(x => x.j[j] ?? 0)]),
  } : null;

  // ── Santé ───────────────────────────────────────────────────
  const heuresAttendues = (() => {
    if (!e.debut || !e.fin) return null;
    let n = 0;
    const d = new Date(`${e.debut}T00:00:00Z`);
    const fin = new Date(`${e.fin}T23:00:00Z`);
    for (; d <= fin && d < maintenant; d.setUTCHours(d.getUTCHours() + 1)) {
      const h = d.getUTCHours();
      if (e.heureDebut == null || e.heureFin == null || (e.heureDebut <= e.heureFin ? h >= e.heureDebut && h <= e.heureFin : h >= e.heureDebut || h <= e.heureFin)) n++;
    }
    return n;
  })();
  const nonClasses: string[] = [];
  const sante: Tableau = {
    note: 'Un capteur à pile n’envoie parfois qu’en cas de changement : quelques heures mesurées ne prouvent pas une panne. « Figé » : valeur identique sur toute la période.',
    colonnes: [
      { titre: 'Site', format: 'texte' }, { titre: 'Capteur', format: 'texte' }, { titre: 'Famille', format: 'texte' }, { titre: 'Modèle', format: 'texte' },
      { titre: 'Heures mesurées', format: 'nombre' }, { titre: 'Part des heures attendues', format: 'pct' }, { titre: 'Dernière mesure', format: 'dateheure' },
      { titre: 'Pile la plus basse (%)', format: 'nombre' }, { titre: 'Signal moyen (dBm)', format: 'nombre' }, { titre: 'Remarque', format: 'texte' },
    ],
    lignes: ordre.map(a => {
      const mesures = a.lignes.filter(l => l.nbMesures > 0);
      const piles = a.lignes.map(l => uneValeur(l.valeurs.batterie)).filter((v): v is number => v != null);
      const signaux = a.lignes.map(l => uneValeur(l.valeurs.signal)).filter((v): v is number => v != null);
      const pile = piles.length ? Math.min(...piles) : null;
      const part = heuresAttendues ? mesures.length / heuresAttendues : null;
      const remarques: string[] = [];
      if (!a.famille) { remarques.push('Non classé'); nonClasses.push(nomCapteur(a)); }
      if (mesures.length === 0) remarques.push('Aucune mesure sur la période');
      // Seulement ce qui varie toujours : une porte fermée reste à 0°, une pièce noire à 0 lux
      const parGrandeur = defs.filter(d => ['temperature', 'humidite', 'pression'].includes(d.cle))
        .map(d => ({ d, v: valeursDe(a, d.cle).map(l => l.valeurs[d.cle]) })).filter(x => x.v.length >= 24);
      const fige = parGrandeur.find(x => new Set(x.v).size === 1);
      if (fige) {
        remarques.push(`${fige.d.libelle} figée à ${nf(fige.v[0])}`);
        aVerifierAuto.push(`${nomCapteur(a)} : ${fige.d.libelle.toLowerCase()} figée à ${nf(fige.v[0])}${fige.d.unite ? ` ${fige.d.unite}` : ''} sur ${fige.v.length} heures. Capteur bloqué ?`);
      }
      // Une pile à 0 % qui continue d'émettre n'indique rien : appareil sans doute alimenté autrement
      if (pile != null && pile > 0 && pile <= 20) {
        remarques.push('Pile faible');
        aVerifierAuto.push(`${nomCapteur(a)} : pile descendue à ${nf(pile, 0)} %. À remplacer ?`);
      }
      if (mesures.length === 0) aVerifierAuto.push(`${nomCapteur(a)} : aucune mesure sur la période. Hors ligne, ou retiré ?`);
      return [
        a.site, a.nom, a.famille ? NOMS_FAMILLE[a.famille] ?? a.famille : 'non classé', a.type,
        mesures.length, part, mesures.length ? mesures[mesures.length - 1].ts : null,
        pile, moyenne(signaux), remarques.join(' ; ') || null,
      ];
    }),
  };

  // ── Croisements : uniquement sur un même site ───────────────
  let croisements: Tableau | null = null;
  if (e.energieParJourEtSite && e.energieParJourEtSite.size > 0) {
    const lignesX: (string | number | null)[][] = [];
    const correler = (paires: { x: number; y: number }[]) => {
      if (paires.length < 7) return null;
      const mx = moyenne(paires.map(p => p.x))!;
      const my = moyenne(paires.map(p => p.y))!;
      const num = paires.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
      const den = Math.sqrt(paires.reduce((s, p) => s + (p.x - mx) ** 2, 0) * paires.reduce((s, p) => s + (p.y - my) ** 2, 0));
      return den > 0 ? num / den : null;
    };
    for (const [site, energie] of e.energieParJourEtSite) {
      for (const a of ordre.filter(x => x.site === site)) {
        for (const def of defs.filter(d => d.cle === 'temperature')) {
          const parJ = new Map<string, number[]>();
          for (const l of valeursDe(a, def.cle)) parJ.set(cleUtc(l.ts), [...(parJ.get(cleUtc(l.ts)) ?? []), l.valeurs[def.cle]]);
          const paires = [...parJ].filter(([j]) => energie.has(j)).map(([j, v]) => ({ x: moyenne(v)!, y: energie.get(j)! }));
          // Capteur figé : rien à comparer
          if (new Set(valeursDe(a, def.cle).map(l => l.valeurs[def.cle])).size <= 1) continue;
          const r = correler(paires);
          if (r != null) {
            lignesX.push([site, `${def.libelle} : ${a.nom}`, paires.length, r]);
            if (Math.abs(r) >= 0.5) constats.push(`${plusieursSites ? `${site} : l` : 'L'}a consommation ${r > 0 ? 'monte' : 'baisse'} quand la température de « ${a.nom} » monte (corrélation ${nf(r, 2)}). Un lien observé, pas une cause prouvée.`);
          }
        }
      }
      for (const [id, liste] of parAppareilEtat) {
        const a = appareils.get(id);
        const actif = actifDe(liste);
        if (!a || a.site !== site || !actif) continue;
        const paires = [...energie].map(([j, y]) => ({ x: actif.x.par_jour[j] ?? 0, y }));
        const r = correler(paires);
        if (r != null) lignesX.push([site, `${actif.def.action} : ${a.nom}`, paires.length, r]);
      }
    }
    if (lignesX.length) {
      croisements = {
        note: 'Corrélation sur les jours communs, de −1 à +1, calculée à partir de 7 jours. Elle montre un lien observé, pas une cause.',
        colonnes: [{ titre: 'Site', format: 'texte' }, { titre: 'Consommation du jour comparée à', format: 'texte' }, { titre: 'Jours communs', format: 'nombre' }, { titre: 'Corrélation', format: 'decimal' }],
        lignes: lignesX,
      };
    }
  }

  // ── Constats ────────────────────────────────────────────────
  const assezDeJours = jours.length >= 3;
  for (const def of defs) {
    for (const a of ordre) {
      const ls = valeursDe(a, def.cle);
      if (ls.length < 24) continue;
      // Capteur figé : signalé dans Santé, sans décrire une fausse variation
      if (def.nature !== 'cumul' && new Set(ls.map(l => l.valeurs[def.cle])).size <= 1) continue;
      if (def.nature === 'cumul') {
        const tot = ls.reduce((s, l) => s + l.valeurs[def.cle], 0);
        if (tot > 0) constats.push(`${nomCapteur(a)} : ${nf(tot)} ${def.unite} de ${def.libelle.toLowerCase()} au total.`);
        continue;
      }
      // Les constats détaillés sont réservés à ce qui se lit directement
      if (!['temperature', 'humidite'].includes(def.cle) || !assezDeJours) continue;
      const bornes = BORNES[def.cle] ?? {};
      const hauteDe = (l: LigneCapteur) => (bornes.max ? uneValeur(l.valeurs[bornes.max]) : null) ?? l.valeurs[def.cle];
      const basseDe = (l: LigneCapteur) => (bornes.min ? uneValeur(l.valeurs[bornes.min]) : null) ?? l.valeurs[def.cle];
      const haut = ls.reduce((x, l) => (hauteDe(l) > hauteDe(x) ? l : x));
      const bas = ls.reduce((x, l) => (basseDe(l) < basseDe(x) ? l : x));
      const jour = moyenne(ls.filter(l => dansPlage(l.ts.getUTCHours(), t.jourDebut, t.jourFin)).map(l => l.valeurs[def.cle]));
      const nuit = moyenne(ls.filter(l => !dansPlage(l.ts.getUTCHours(), t.jourDebut, t.jourFin)).map(l => l.valeurs[def.cle]));
      constats.push(`${nomCapteur(a)} : ${def.libelle.toLowerCase()} de ${nf(basseDe(bas))} ${def.unite} (${instant(bas.ts)}) à ${nf(hauteDe(haut))} ${def.unite} (${instant(haut.ts)})${jour != null && nuit != null ? ` ; moyenne ${nf(jour)} ${def.unite} le jour, ${nf(nuit)} ${def.unite} la nuit` : ''}.`);
    }
  }
  if (e.etats == null && [...appareils.values()].some(a => a.famille === 'ETAT')) {
    constats.push('Capteurs d’état : comptage indisponible sur cette période. Le reste du rapport est complet.');
  }
  for (const l of lignesEtats) {
    const nb = l[3];
    if (typeof nb === 'number' && nb > 0 && typeof l[5] === 'number') {
      constats.push(`${plusieursSites ? `${l[0]} · ` : ''}${l[1]} : ${nb.toLocaleString('fr-FR')} ${String(l[2]).toLowerCase()}, ${String(l[4]).toLowerCase()} ${nf(l[5])} h.`);
    }
  }

  const compte = new Map<string, number>();
  for (const a of appareils.values()) compte.set(a.famille ?? 'NON_CLASSE', (compte.get(a.famille ?? 'NON_CLASSE') ?? 0) + 1);
  const morceaux = [...compte].map(([f, n]) => (f === 'NON_CLASSE' ? `${n} non classé${n > 1 ? 's' : ''}` : pluriel(n, NOMS_FAMILLE[f] ?? f)));

  return {
    resume: morceaux.join(', '), nbSites: sites.length,
    grandeurs, vues, etats: etatsTableau, etatsParHeure, etatsParJour, sante, nonClasses, croisements, constats, aVerifierAuto,
  };
}

/** Comparaison des sites pour l'écran et le rapport : l'énergie de chaque site, sans double comptage. */
export function tableauComparaisonSites(lignes: { site: string; kwh: number; jours: number; heures: number; jourKwh: number; nuitKwh: number; soirKwh: number; pMax: number | null; talon: number | null; nature: string }[]): Tableau {
  const total = lignes.reduce((s, l) => s + l.kwh, 0);
  return {
    note: 'Série principale de chaque site. Les puissances maximales ne s’additionnent pas : elles n’ont pas lieu au même moment. Pic et talon ne sont donnés que pour un site à un seul compteur de référence.',
    colonnes: [
      { titre: 'Site', format: 'texte' }, { titre: 'Série mesurée', format: 'texte' }, { titre: 'kWh', format: 'kwh' }, { titre: 'Part du total', format: 'pct' },
      { titre: 'Jours', format: 'nombre' }, { titre: 'kWh par jour', format: 'kwh' }, { titre: 'Heures mesurées', format: 'nombre' },
      { titre: 'Part du jour', format: 'pct' }, { titre: 'Part de la nuit', format: 'pct' }, { titre: 'Part de la soirée', format: 'pct' },
      { titre: 'P max (W)', format: 'nombre' }, { titre: 'Talon nuit (W)', format: 'nombre' },
    ],
    lignes: [...lignes].sort((a, b) => b.kwh - a.kwh).map(l => [
      l.site, l.nature, l.kwh, total > 0 ? l.kwh / total : null, l.jours, l.jours ? l.kwh / l.jours : null, l.heures,
      l.kwh > 0 ? l.jourKwh / l.kwh : null, l.kwh > 0 ? l.nuitKwh / l.kwh : null, l.kwh > 0 ? l.soirKwh / l.kwh : null, l.pMax, l.talon,
    ]),
  };
}
