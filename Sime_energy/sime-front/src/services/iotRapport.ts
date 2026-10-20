/**
 * Rapport de la Courbe de charge (IOT) — modèle de données commun à
 * l'Excel et au futur PDF.
 *
 * Règles validées le 20/10/2026 (« il ne faut pas faire un faux rapport ») :
 *  1. aucun nouveau calcul d'énergie : tout vient des objets qui produisent
 *     l'écran (analyserDonneesShelly, nettoyerProfil, bilan par rôle) ;
 *  2. le rapport porte le périmètre de l'écran ;
 *  3. ce qui n'est pas mesuré s'écrit « non mesuré », jamais 0 ;
 *  4. une phrase n'est écrite que si ses données suffisent ;
 *  5. les exclusions sont annoncées ;
 *  6. jamais d'addition entre rôles différents (arrivée + départs, PV +
 *     consommation…) ni entre phases et total.
 */

import type { ShellyAnalyse, ShellyRow, FluxRoles, JourAgrege } from '@/components/iot/shared';
import type { RapportNettoyage, NaturePrincipale } from '@/lib/iot-profil-engine';
import { cleJour } from '@/lib/iot-profil-engine';
import { periodesInRange, type DevicePeriode } from '@/lib/shelly-device-period-service';

/** Bilan par rôle tel qu'affiché par la Courbe de charge (nettoyageFlux). */
export interface BilanEcran {
  nature: NaturePrincipale;
  flux: FluxRoles;
  nonMesure: number | null;
  methodes: string;
  raisons: string;
}

export interface EntreeRapport {
  analyse: ShellyAnalyse;
  /** Lignes appareil × jour avant nettoyage (pour dire si un compteur a des données). */
  lignes: ShellyRow[];
  nettoyage: RapportNettoyage;
  bilan: BilanEcran | null;
  /** Titre de la carte principale de l'écran (« Consommation », « Départs mesurés »…). */
  libellePrincipal: string;
  perimetre: {
    source: 'base' | 'fichier';
    sites: string[];
    appareils: string[];
    debut?: string;
    fin?: string;
    heureDebut?: number;
    heureFin?: number;
    filtreJours: string;
  };
  options: { completude: boolean; masquerZeros: boolean; quarantaine: boolean };
  versionRegles: string;
  periodes: DevicePeriode[];
  auteur: string;
  commentaire: string;
  dateExport: Date;
}

export interface ChiffreCle {
  libelle: string;
  /** null = non mesuré / non calculable (jamais 0 par défaut). */
  valeur: number | null;
  unite: string;
  precision: string;
}

export interface Tableau {
  colonnes: { titre: string; format?: 'kwh' | 'nombre' | 'texte' | 'date' | 'pct' }[];
  lignes: (string | number | Date | null)[][];
  /** Avertissement affiché au-dessus du tableau. */
  note?: string;
}

export interface RapportCourbe {
  titre: string;
  sousTitre: string;
  perimetre: [string, string][];
  chiffres: ChiffreCle[];
  phrases: string[];
  commentaire: { texte: string; auteur: string; date: Date } | null;
  journalier: Tableau;
  typesJour: Tableau;
  mensuel: Tableau;
  qualite: { signalements: Tableau; joursExclus: Tableau; listes: [string, string][]; sites: Tableau | null };
  detail: Tableau;
}

const nf = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtCle = (cle: string) => new Date(`${cle}T00:00:00`).toLocaleDateString('fr-FR');
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Flux mesurés à part, dans l'ordre d'affichage ; seuls ceux qui ont une
 * mesure. Mêmes flux que les cartes et courbes de l'écran : le compteur de
 * charge M3 n'y figure pas (quand il sert, il EST la série principale).
 */
const FLUX: { cle: keyof FluxRoles; libelle: string }[] = [
  { cle: 'reseauSoutire', libelle: 'Réseau soutiré' },
  { cle: 'reseauInjecte', libelle: 'Réseau injecté' },
  { cle: 'pv', libelle: 'Production PV' },
  { cle: 'groupe', libelle: 'Groupe électrogène' },
  { cle: 'departs', libelle: 'Départs mesurés' },
];

/** Rôle d'appareil qui porte chaque flux. */
const ROLE_DU_FLUX: Record<keyof FluxRoles, string> = {
  reseauSoutire: 'M1_RESEAU', reseauInjecte: 'M1_RESEAU', pv: 'M5_PV', groupe: 'M4_GROUPE', charge: 'M3_CHARGE', departs: 'DEPART',
};

const LIBELLE_ROLE: Record<string, string> = {
  M1_RESEAU: 'Arrivée réseau', M2_SELECTEUR: 'Sélecteur (M2)', M3_CHARGE: 'Charge (M3)', M4_GROUPE: 'Groupe',
  M5_PV: 'Production PV', DEPART: 'Départ', AUTRE: 'Autre', AMBIANCE: 'Ambiance',
};

/**
 * Ce que le capteur mesurait ce jour-là (shelly_device_periodes) : un capteur
 * déplacé ou incertain porte son libellé réel, pas son nom Shelly.
 */
function libelleAppareil(r: ShellyRow, periodes: DevicePeriode[]): { nom: string; note: string } {
  const nom = r.nomAppareil ?? r.deviceId ?? '?';
  if (!r.deviceId) return { nom, note: '' };
  const d = r.date instanceof Date ? r.date : new Date(r.date);
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(debut.getTime() + 86_400_000);
  const ps = periodesInRange(periodes, r.deviceId, debut, fin);
  if (ps.length === 0) return { nom, note: '' };
  const libelle = ps.map(p => p.libelle).join(' puis ');
  const incertain = ps.some(p => p.statut === 'incertain');
  return {
    nom: libelle,
    note: incertain ? `appareil incertain (nom Shelly : ${nom})` : ps.length > 1 ? `capteur déplacé ce jour (nom Shelly : ${nom})` : '',
  };
}

/**
 * Un flux à 0 n'est pas forcément une mesure : compteur qui émet mais compte
 * 0 (règle ZERO_ARRIVEE) → non mesuré ; compteur présent quelques jours
 * seulement → on dit combien. Partagé par le rapport et les cartes de l'écran.
 */
export function etatDuFlux(
  cle: keyof FluxRoles,
  v: number,
  ctx: { lignes: ShellyRow[]; nettoyage: RapportNettoyage; nbJours: number; quarantaine: boolean },
): { valeur: number | null; precision: string } {
  const role = ROLE_DU_FLUX[cle];
  const lignesRole = ctx.lignes.filter(r => r.role === role);
  const ids = new Set(lignesRole.map(r => r.deviceId).filter(Boolean));
  const jours = new Set(lignesRole.map(r => cleJour(r.date))).size;
  const aZero = ctx.nettoyage.groupes.some(g => g.regle === 'ZERO_ARRIVEE' && g.plages.some(sg => sg.device_id && ids.has(sg.device_id)));
  if (Math.abs(v) >= 0.0005) return { valeur: v, precision: 'Mesuré à part, jamais additionné aux autres flux' };
  if (aZero) return { valeur: null, precision: 'Non mesuré : le compteur émet mais compte 0 (règle « Compteur principal à zéro »)' };
  return {
    valeur: v,
    precision: `0 kWh compté, compteur présent ${jours} jour(s) sur ${ctx.nbJours}`
      + (ctx.quarantaine && ctx.nettoyage.kwhQuarantaine > 0 ? ' (après retrait de la quarantaine)' : ''),
  };
}

export function construireRapport(e: EntreeRapport): RapportCourbe {
  const { analyse, nettoyage, bilan } = e;
  const nonCalculable = bilan?.nature === 'aucune';
  // « Énergie mesurée (voir détail) : non mesurée » ne veut rien dire
  const libellePrincipal = nonCalculable ? 'Consommation' : e.libellePrincipal;

  const etatFlux = (cle: keyof FluxRoles, v: number) =>
    etatDuFlux(cle, v, { lignes: e.lignes, nettoyage, nbJours: analyse.nbJours, quarantaine: e.options.quarantaine });
  const retenus = analyse.parJour.filter(j => !j.exclu);
  const nbExclus = analyse.nbJours - analyse.nbJoursRetenus;

  // ── Périmètre (règle 2) ─────────────────────────────────────
  const p = e.perimetre;
  const perimetre: [string, string][] = [
    ['Source', p.source === 'base' ? 'Base de données Shelly (agrégation journalière fn_profil_charge)' : "Fichier importé (lignes du fichier, sans rôles d'appareil)"],
    ['Site(s)', p.sites.length ? p.sites.join(', ') : '—'],
    ['Appareils', p.appareils.length ? `${p.appareils.length} : ${p.appareils.join(', ')}` : '—'],
  ];
  if (p.debut && p.fin) perimetre.push(['Période', `du ${fmtCle(p.debut)} au ${fmtCle(p.fin)} (${pluriel(analyse.nbJours, 'jour')} avec données)`]);
  if (p.heureDebut != null && p.heureFin != null) {
    perimetre.push(['Heures (chaque jour)', p.heureDebut === 0 && p.heureFin === 23 ? 'journée entière' : `de ${p.heureDebut} h à ${p.heureFin + 1} h`]);
  }
  perimetre.push(['Jours retenus', p.filtreJours]);
  perimetre.push(['Nettoyage', [
    e.options.quarantaine ? 'heures en quarantaine retirées' : 'heures en quarantaine conservées',
    e.options.completude ? 'jours incomplets exclus des statistiques' : 'jours incomplets conservés',
    e.options.masquerZeros ? 'appareils à 0 masqués du détail' : 'appareils à 0 conservés',
  ].join(' · ')]);
  if (p.source === 'base') perimetre.push(['Règles qualité', `version ${e.versionRegles}`]);
  if (bilan?.methodes) perimetre.push(['Méthode de consommation', bilan.methodes]);
  perimetre.push(['Rapport établi par', `${e.auteur} — ${e.dateExport.toLocaleString('fr-FR')}`]);

  // ── Chiffres clés : exactement les cartes de l'écran ────────
  const chiffres: ChiffreCle[] = [];
  chiffres.push({
    libelle: libellePrincipal,
    valeur: nonCalculable ? null : analyse.totalKwhNet,
    unite: 'kWh',
    precision: nonCalculable
      ? `Non mesuré : ${bilan?.raisons || 'rien de mesuré pour la série principale'}`
      : `${pluriel(analyse.nbJours, 'jour')}${nbExclus > 0 ? `, dont ${nbExclus} exclu(s) des statistiques mais compté(s) dans le total` : ''}`
        + (bilan && bilan.nature !== 'consommation' && bilan.raisons ? `. N'est pas la consommation totale : ${bilan.raisons}` : ''),
  });
  chiffres.push({
    libelle: 'Moyenne journalière',
    valeur: nonCalculable || analyse.nbJoursRetenus === 0 ? null : analyse.moyenneJournaliere,
    unite: 'kWh/j',
    precision: nonCalculable ? 'Non calculable' : `Sur ${pluriel(analyse.nbJoursRetenus, 'jour')} retenu(s)`,
  });
  if (!nonCalculable && analyse.nbJoursRetenus > 0) {
    chiffres.push({ libelle: 'Jour le plus élevé', valeur: analyse.maxJournalier, unite: 'kWh', precision: 'Jours retenus seulement' });
    chiffres.push({ libelle: 'Jour le plus bas', valeur: analyse.minJournalier, unite: 'kWh', precision: 'Jours retenus seulement' });
  }
  if (bilan) {
    for (const f of FLUX) {
      const v = bilan.flux[f.cle];
      if (v == null) continue;
      // Les départs sont déjà la série principale quand nature = departs
      if (f.cle === 'departs' && bilan.nature === 'departs') continue;
      chiffres.push({ libelle: f.libelle, unite: 'kWh', ...etatFlux(f.cle, v) });
    }
    if (bilan.flux.departs != null && bilan.nature !== 'departs') {
      chiffres.push({
        libelle: 'Part non mesurée (consommation − départs)',
        valeur: bilan.nonMesure,
        unite: 'kWh',
        precision: bilan.nonMesure == null ? "Non calculable : l'arrivée n'alimente pas tous les départs" : 'Seulement si la consommation vient du compteur d’arrivée',
      });
    }
  } else {
    chiffres.push({
      libelle: 'Énergie retournée',
      valeur: analyse.totalKwhRetour,
      unite: 'kWh',
      precision: analyse.totalKwhConsomme > 0 ? `${nf((analyse.totalKwhRetour / analyse.totalKwhConsomme) * 100)} % du brut` : '',
    });
  }
  if (e.options.quarantaine && nettoyage.kwhQuarantaine > 0) {
    chiffres.push({ libelle: 'Énergie en quarantaine retirée', valeur: nettoyage.kwhQuarantaine, unite: 'kWh', precision: 'Heures signalées par les règles qualité' });
  }

  // ── Phrases calculées (règle 4 : chacune a sa condition) ────
  const phrases: string[] = [];
  if (nonCalculable) {
    phrases.push(`${libellePrincipal} : non mesurée sur ce périmètre — ${(bilan?.raisons || 'rien de mesuré pour la série principale').replace(/\.+$/, '')}.`);
  } else if (analyse.nbJoursRetenus >= 1) {
    phrases.push(
      `${libellePrincipal} : ${nf(analyse.totalKwhNet)} kWh sur ${pluriel(analyse.nbJours, 'jour')}, `
      + `soit ${nf(analyse.moyenneJournaliere)} kWh/j en moyenne sur ${pluriel(analyse.nbJoursRetenus, 'jour')} retenu(s)`
      + (nbExclus > 0 ? ` (${pluriel(nbExclus, 'jour')} exclu(s) de la moyenne mais compté(s) dans le total).` : '.'),
    );
  } else {
    phrases.push(`${libellePrincipal} : ${nf(analyse.totalKwhNet)} kWh au total ; moyenne journalière — données insuffisantes (aucun jour complet retenu).`);
  }

  // Règle 3 : une série qui n'est pas la consommation (énergie réseau seule,
  // départs partiels) est dite telle, avec la raison déclarée pour le site
  if (bilan && !nonCalculable && bilan.nature !== 'consommation' && bilan.raisons) {
    phrases.push(`Attention : « ${libellePrincipal} » n'est pas la consommation totale du site — ${bilan.raisons.replace(/\.+$/, '')}.`);
  }

  if (!nonCalculable) {
    if (retenus.length >= 2) {
      const haut = retenus.reduce((a, b) => (b.kwhNet > a.kwhNet ? b : a));
      const bas = retenus.reduce((a, b) => (b.kwhNet < a.kwhNet ? b : a));
      phrases.push(`Jour le plus élevé : ${fmtJour(haut.date)} (${nf(haut.kwhNet)} kWh) ; jour le plus bas : ${fmtJour(bas.date)} (${nf(bas.kwhNet)} kWh).`);
    } else {
      phrases.push('Jours le plus élevé et le plus bas : données insuffisantes (moins de 2 jours retenus).');
    }

    const { weekend: we, jourOuvre: ouv } = analyse;
    if (we.nbJours >= 2 && ouv.nbJours >= 3 && ouv.kwhMoyen > 0) {
      const ecart = ((we.kwhMoyen - ouv.kwhMoyen) / ouv.kwhMoyen) * 100;
      phrases.push(
        `Un jour de week-end : ${nf(we.kwhMoyen)} kWh en moyenne, soit ${nf(Math.abs(ecart), 0)} % de ${ecart < 0 ? 'moins' : 'plus'} `
        + `qu'un jour ouvré (${nf(ouv.kwhMoyen)} kWh) — sur ${pluriel(we.nbJours, 'jour')} de week-end et ${pluriel(ouv.nbJours, 'jour')} ouvré(s).`,
      );
    } else {
      phrases.push(`Comparaison week-end / jours ouvrés : données insuffisantes (${pluriel(we.nbJours, 'jour')} de week-end et ${pluriel(ouv.nbJours, 'jour')} ouvré(s) retenus ; il en faut au moins 2 et 3).`);
    }
  }

  if (bilan) {
    if (bilan.flux.departs != null && bilan.nature !== 'departs' && bilan.nonMesure != null && !nonCalculable && analyse.totalKwhNet > 0) {
      if (bilan.nonMesure < 0) {
        phrases.push(`Les départs mesurés (${nf(bilan.flux.departs)} kWh) dépassent la consommation de l'arrivée de ${nf(-bilan.nonMesure)} kWh : incohérence à vérifier.`);
      } else {
        phrases.push(
          `Départs mesurés : ${nf(bilan.flux.departs)} kWh, soit ${nf((bilan.flux.departs / analyse.totalKwhNet) * 100, 0)} % de la consommation ; `
          + `part non mesurée par les départs : ${nf(bilan.nonMesure)} kWh.`,
        );
      }
    }
    if (bilan.flux.pv != null) phrases.push(`Production PV : ${nf(bilan.flux.pv)} kWh, mesurée à part (jamais additionnée à la consommation).`);
    if (bilan.flux.groupe != null) phrases.push(`Groupe électrogène : ${nf(bilan.flux.groupe)} kWh, mesuré à part.`);
  } else {
    phrases.push("Données d'un fichier importé : sans rôle d'appareil, les totaux additionnent toutes les lignes du fichier.");
  }

  const coupures = nettoyage.groupes.find(g => g.regle === 'COUPURE');
  if (coupures && coupures.plages.length > 0) {
    const minutes = coupures.plages.reduce((s, sg) => s + (sg.valeur ?? 0), 0);
    phrases.push(`Coupures détectées : ${coupures.plages.length}, pour ${nf(minutes / 60)} h au total.`);
  }
  if (e.options.quarantaine && nettoyage.kwhQuarantaine > 0) {
    phrases.push(`${nf(nettoyage.kwhQuarantaine)} kWh retirés car situés dans des heures en quarantaine (règles qualité).`);
  }
  if (nbExclus > 0) {
    const raisons = analyse.parJour.filter(j => j.exclu).slice(0, 5).map(j => `${fmtCle(cleJour(j.date))} (${j.exclu})`);
    phrases.push(`${pluriel(nbExclus, 'jour')} exclu(s) des statistiques : ${raisons.join(' ; ')}${nbExclus > 5 ? ' ; …' : '.'}`);
  }
  if (nettoyage.joursSansDonnee.length > 0) {
    const n = nettoyage.joursSansDonnee.length;
    phrases.push(`${pluriel(n, 'jour')} sans aucune donnée : ${nettoyage.joursSansDonnee.slice(0, 8).map(fmtCle).join(', ')}${n > 8 ? ', …' : '.'}`);
  }

  // ── Journalier ──────────────────────────────────────────────
  const controleDe = new Map(nettoyage.jours.map(j => [j.cle, j]));
  const fluxPresents = bilan ? FLUX.filter(f => bilan.flux[f.cle] != null) : [];
  const fluxNonMesures = new Set(fluxPresents.filter(f => etatFlux(f.cle, bilan!.flux[f.cle]!).valeur == null).map(f => f.cle));
  const journalier: Tableau = {
    note: nonCalculable
      ? 'Série principale non mesurée sur ce périmètre : seuls les flux mesurés à part sont donnés. Ne pas additionner les colonnes entre elles.'
      : 'Les flux mesurés à part ne s’additionnent ni entre eux ni à la série principale.',
    colonnes: [
      { titre: 'Date', format: 'date' },
      { titre: 'Jour', format: 'texte' },
      { titre: 'Type de jour', format: 'texte' },
      ...(bilan
        ? [...(nonCalculable ? [] : [{ titre: `${libellePrincipal} (kWh)`, format: 'kwh' as const }]),
           ...fluxPresents.map(f => ({ titre: `${f.libelle} (kWh)${fluxNonMesures.has(f.cle) ? ' — non mesuré' : ''}`, format: 'kwh' as const }))]
        : [{ titre: 'kWh total', format: 'kwh' as const }, { titre: 'kWh retour', format: 'kwh' as const }, { titre: 'kWh net', format: 'kwh' as const }]),
      { titre: 'Coupures (min)', format: 'nombre' },
      { titre: 'Exclu des statistiques', format: 'texte' },
      { titre: 'Incohérence', format: 'texte' },
    ],
    lignes: analyse.parJour.map((j: JourAgrege & { exclu?: string }) => {
      const c = controleDe.get(cleJour(j.date));
      return [
        j.date,
        j.date.toLocaleDateString('fr-FR', { weekday: 'long' }),
        j.jourActivites,
        ...(bilan
          ? [...(nonCalculable ? [] : [j.kwhNet]), ...fluxPresents.map(f => (fluxNonMesures.has(f.cle) ? null : j.flux?.[f.cle] ?? null))]
          : [j.kwhTotal, j.kwhRetourTotal, j.kwhNet]),
        c?.coupureMin ? Math.round(c.coupureMin) : null,
        j.exclu ?? null,
        c?.incoherence ?? null,
      ];
    }),
  };

  // ── Types de jour ───────────────────────────────────────────
  const typesJour: Tableau = {
    note: 'Moyennes sur les jours retenus (jours exclus écartés).',
    colonnes: [{ titre: 'Type de jour', format: 'texte' }, { titre: 'kWh moyen par jour', format: 'kwh' }, { titre: 'Nombre de jours', format: 'nombre' }],
    lignes: nonCalculable ? [] : [
      ['Jours ouvrés', analyse.jourOuvre.nbJours ? analyse.jourOuvre.kwhMoyen : null, analyse.jourOuvre.nbJours],
      ['Week-ends', analyse.weekend.nbJours ? analyse.weekend.kwhMoyen : null, analyse.weekend.nbJours],
      ['Jours fériés', analyse.ferieOuDimanche.nbJours ? analyse.ferieOuDimanche.kwhMoyen : null, analyse.ferieOuDimanche.nbJours],
    ],
  };

  // ── Mensuel ─────────────────────────────────────────────────
  const mensuel: Tableau = {
    colonnes: [
      { titre: 'Mois', format: 'texte' },
      ...(nonCalculable ? [] : [{ titre: `${bilan ? libellePrincipal : 'kWh net'} (kWh)`, format: 'kwh' as const }]),
      ...(bilan ? [] : [{ titre: 'kWh total', format: 'kwh' as const }, { titre: 'kWh retour', format: 'kwh' as const }]),
      { titre: 'Jours avec données', format: 'nombre' },
    ],
    lignes: Object.entries(analyse.parMois).map(([mois, m]) => [
      mois,
      ...(nonCalculable ? [] : [m.kwhNet]),
      ...(bilan ? [] : [m.kwhTotal, m.kwhRetour]),
      m.nbJours,
    ]),
  };

  // ── Qualité ─────────────────────────────────────────────────
  const signalements: Tableau = {
    colonnes: [
      { titre: 'Règle', format: 'texte' }, { titre: 'Libellé', format: 'texte' }, { titre: 'Action', format: 'texte' },
      { titre: 'Plages', format: 'nombre' }, { titre: 'Heures', format: 'nombre' }, { titre: 'kWh concernés', format: 'kwh' },
      { titre: 'Appareils', format: 'texte' }, { titre: 'Explication', format: 'texte' },
    ],
    lignes: nettoyage.groupes.map(g => [g.regle, g.libelle, g.action, g.plages.length, g.heures, g.kwh || null, g.appareils.join(', '), g.explication]),
  };
  const joursExclus: Tableau = {
    colonnes: [{ titre: 'Jour', format: 'date' }, { titre: 'Raison', format: 'texte' }],
    lignes: analyse.parJour.filter(j => j.exclu).map(j => [j.date, j.exclu!]),
  };
  const listes: [string, string][] = [
    ['Référence de complétude', nettoyage.referenceCompletude.join(', ') || '—'],
    ['Jours sans aucune donnée', nettoyage.joursSansDonnee.map(fmtCle).join(', ') || 'aucun'],
    ['Appareils hors de la série principale', nettoyage.horsTotal.join(', ') || 'aucun'],
    ['Appareils à 0 masqués du détail', nettoyage.appareilsMasques.join(', ') || 'aucun'],
  ];
  const sites: Tableau | null = nettoyage.sites.length ? {
    colonnes: [
      { titre: 'Site', format: 'texte' }, { titre: 'Méthode déclarée', format: 'texte' }, { titre: 'Série principale', format: 'texte' },
      { titre: 'kWh série principale', format: 'kwh' }, { titre: 'Non mesuré (kWh)', format: 'kwh' }, { titre: 'Remarque', format: 'texte' },
    ],
    lignes: nettoyage.sites.map(s => [
      s.site, s.methode, s.nature,
      s.nature === 'aucune' ? null : s.principal, s.nonMesure, s.raison ?? (s.explication || null),
    ]),
  } : null;

  // ── Détail par appareil et par jour ─────────────────────────
  const detail: Tableau = {
    note: bilan
      ? 'Une ligne par appareil et par jour. Ne pas additionner des lignes de rôles différents (arrivée, départs, PV…) : utiliser la feuille Journalier. Production PV : l’énergie produite est dans « kWh retour » (sens du compteur corrigé).'
      : 'Lignes du fichier importé, telles que lues.',
    colonnes: [
      { titre: 'Date', format: 'date' }, { titre: 'Site', format: 'texte' }, { titre: 'Appareil', format: 'texte' },
      { titre: 'Remarque', format: 'texte' }, { titre: 'Rôle', format: 'texte' },
      { titre: 'kWh consommés', format: 'kwh' }, { titre: 'kWh retour', format: 'kwh' },
      { titre: 'Phase A (kWh)', format: 'kwh' }, { titre: 'Phase B (kWh)', format: 'kwh' }, { titre: 'Phase C (kWh)', format: 'kwh' },
      { titre: 'Heures présentes', format: 'nombre' },
      { titre: 'Quarantaine retirée (kWh)', format: 'kwh' },
    ],
    lignes: [...nettoyage.rowsAffichage]
      .sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime() || (a.nomAppareil ?? '').localeCompare(b.nomAppareil ?? ''))
      .map(r => {
        const app = libelleAppareil(r, e.periodes);
        return [
          r.date instanceof Date ? r.date : new Date(r.date),
          r.deviceLocation ?? null,
          app.nom,
          app.note || null,
          r.role ? (LIBELLE_ROLE[r.role] ?? r.role) : null,
          r.kwhTotal, r.kwhRetourTotal,
          r.kwhA || null, r.kwhB || null, r.kwhC || null,
          r.nbHeures ?? null,
          e.options.quarantaine && r.quarantaine?.kwh ? r.quarantaine.kwh : null,
        ];
      }),
  };

  const sitesTitre = p.sites.length === 1 ? p.sites[0] : p.sites.length ? `${p.sites.length} sites` : 'Fichier importé';
  return {
    titre: `Courbe de charge — ${sitesTitre}`,
    sousTitre: p.debut && p.fin ? `du ${fmtCle(p.debut)} au ${fmtCle(p.fin)}` : '',
    perimetre,
    chiffres,
    phrases,
    commentaire: e.commentaire.trim() ? { texte: e.commentaire.trim(), auteur: e.auteur, date: e.dateExport } : null,
    journalier,
    typesJour,
    mensuel,
    qualite: { signalements, joursExclus, listes, sites },
    detail,
  };
}
