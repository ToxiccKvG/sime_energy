/**
 * Dictionnaire unique des définitions affichées au survol (cartes KPI et
 * termes techniques soulignés) dans les modules Mesures et IOT.
 *
 * Une entrée = un terme, écrit une seule fois : le même texte apparaît partout
 * où le terme est utilisé. « calcul » décrit la formule réellement appliquée
 * par la plateforme — à garder aligné avec services/analysisModels,
 * lib/model-comparison et lib/sensor-comparison.
 */
export interface GlossaryEntry {
  /** Nom affiché en tête de la bulle. */
  term: string;
  /** Ce que c'est, en une ou deux phrases sans jargon. */
  definition: string;
  /** Comment la plateforme le calcule (facultatif). */
  calcul?: string;
}

export const GLOSSARY = {
  /* ---------------------------------------------------------- notions de base */
  mediane: {
    term: 'Médiane',
    definition: 'Valeur du milieu : la moitié des valeurs est au-dessus, l\'autre moitié en dessous. Contrairement à la moyenne, elle n\'est pas tirée par quelques valeurs extrêmes.',
  },
  p10p90: {
    term: 'Enveloppe P10–P90',
    definition: 'Plage où se situent 80 % des valeurs observées à cette heure : 10 % des jours sont en dessous, 10 % au-dessus.',
  },
  p95: {
    term: 'Pointe P95',
    definition: 'Niveau haut de la consommation, dépassé seulement 5 % du temps. Plus représentatif que le maximum, qui peut n\'être qu\'un pic isolé.',
    calcul: '95e centile des valeurs horaires de la période',
  },
  pasNatif: {
    term: 'Pas natif',
    definition: 'Intervalle de temps entre deux mesures tel que le capteur les enregistre (1 min, 10 min, 1 h…).',
  },
  classeJour: {
    term: 'Classe de jour',
    definition: 'Les jours sont comparés entre semblables : ouvrés, week-ends, fériés. On ne compare jamais un dimanche à un mardi.',
  },

  /* ------------------------------------------------------------- profil type */
  jourType: {
    term: 'Journée typique',
    definition: 'Consommation d\'une journée habituelle pour cette classe de jours (ouvrés, week-ends ou fériés). « n j » = nombre de jours de cette classe dans le relevé.',
    calcul: 'médiane des consommations journalières des jours de la classe',
  },
  ratioWeekend: {
    term: 'Week-end / ouvré',
    definition: 'Compare la consommation d\'un jour de week-end à celle d\'un jour ouvré. Un site bien piloté consomme nettement moins le week-end.',
    calcul: 'médiane journalière week-end ÷ médiane journalière ouvré × 100',
  },

  /* ------------------------------------------------------------------- talon */
  talon: {
    term: 'Talon',
    definition: 'Consommation qui ne s\'arrête jamais, même la nuit ou quand le site est vide : veilles, éclairage oublié, froid, serveurs…',
    calcul: 'pour chaque jour, le minimum horaire entre 00h et 05h ; le talon retenu est la médiane de ces minima',
  },
  talonPointe: {
    term: 'Talon / pointe',
    definition: 'Poids du talon par rapport à la pointe : plus il est élevé, plus une grande partie de la puissance reste allumée en permanence.',
    calcul: 'talon ÷ pointe P95 × 100',
  },
  partTalon: {
    term: 'Part du talon dans le cumul',
    definition: 'Part de toute l\'énergie consommée sur la période qui est due au seul talon.',
    calcul: 'énergie du talon sur la période ÷ énergie totale consommée × 100',
  },
  projectionTalon: {
    term: 'Projection annuelle du talon',
    definition: 'Énergie que ce fond de consommation représenterait sur une année complète : c\'est le gisement d\'économie si on l\'éteignait.',
    calcul: 'talon × 8 760 h',
  },

  /* --------------------------------------------------------------- anomalies */
  completude: {
    term: 'Complétude de la collecte',
    definition: 'Part des mesures effectivement reçues par rapport à celles qu\'on aurait dû recevoir. En dessous de 98 %, il manque des données.',
    calcul: 'mesures reçues ÷ mesures attendues au pas natif × 100',
  },
  trous: {
    term: 'Trou de collecte',
    definition: 'Période sans aucune mesure : capteur muet, réseau ou alimentation coupés.',
    calcul: 'intervalle entre deux mesures supérieur à 3 pas natifs',
  },
  figees: {
    term: 'Valeur figée',
    definition: 'La même valeur répétée longtemps : capteur bloqué, ou installation réellement à l\'arrêt si la valeur est 0.',
    calcul: 'au moins 12 mesures identiques consécutives couvrant au moins 2 h',
  },
  trousFigees: {
    term: 'Trous · valeurs figées',
    definition: 'Nombre de trous de collecte (capteur muet) · nombre de valeurs figées (capteur bloqué ou installation à l\'arrêt).',
    calcul: 'trou : plus de 3 pas sans mesure · figée : ≥ 12 mesures identiques sur ≥ 2 h',
  },
  pics: {
    term: 'Pics inhabituels',
    definition: 'Heures où le site a consommé bien plus que d\'habitude à la même heure, pour la même classe de jour.',
    calcul: 'écart à la médiane habituelle supérieur à 3,5 fois la dispersion normale et d\'au moins 20 % ; il faut 3 jours de la même classe',
  },
  creux: {
    term: 'Creux inhabituels',
    definition: 'Heures où le site a consommé bien moins que d\'habitude à la même heure, pour la même classe de jour.',
    calcul: 'écart à la médiane habituelle supérieur à 3,5 fois la dispersion normale et d\'au moins 20 % ; il faut 3 jours de la même classe',
  },

  /* ------------------------------------------------------------ avant / après */
  avant: {
    term: 'Avant',
    definition: 'Consommation moyenne par jour avant la date de l\'action (remplacement d\'équipement, consigne, sensibilisation…). « n j » = nombre de jours.',
    calcul: 'moyenne des consommations journalières avant la date choisie',
  },
  apres: {
    term: 'Après',
    definition: 'Consommation moyenne par jour après la date de l\'action. « n j » = nombre de jours.',
    calcul: 'moyenne des consommations journalières après la date choisie',
  },
  ecartAvantApres: {
    term: 'Écart après − avant',
    definition: 'Variation de la consommation journalière due à l\'action. Négatif = baisse. « Net » si l\'écart dépasse nettement les variations normales d\'un jour à l\'autre.',
    calcul: 'écart des moyennes journalières, calculé classe de jour par classe de jour puis pondéré par les jours « après » ; net si > 2 erreurs-types',
  },
  gain: {
    term: 'Gain sur la période après',
    definition: 'Énergie économisée (ou perdue, si négatif) depuis l\'action, en comparant à des jours de même classe.',
    calcul: 'Σ (écart de la classe × nombre de jours « après » de la classe) ; projection annuelle : écart × jours de la classe dans une année',
  },
  lecture: {
    term: 'Lecture',
    definition: 'Évolution en pourcentage de la moyenne journalière entre avant et après.',
    calcul: '(moyenne après − moyenne avant) ÷ moyenne avant × 100',
  },

  /* ------------------------------------------------- comparaison de modèles A/B */
  pointsCompares: {
    term: 'Points comparés',
    definition: 'Nombre d\'instants où les deux appareils ont une mesure à comparer. « Sans vis-à-vis » = mesures présentes chez un seul des deux.',
  },
  biais: {
    term: 'Biais moyen (B − A)',
    definition: 'De combien l\'appareil B mesure en moyenne au-dessus (positif) ou en dessous (négatif) de l\'appareil A.',
    calcul: 'moyenne des écarts B − A sur tous les points comparés',
  },
  mae: {
    term: 'Écart absolu moyen',
    definition: 'Écart moyen entre A et B, sans tenir compte du sens. Le RMSE pèse davantage les gros écarts.',
    calcul: 'moyenne des |B − A| · RMSE = racine de la moyenne des (B − A)²',
  },
  rmse: {
    term: 'RMSE',
    definition: 'Écart quadratique moyen : comme l\'écart moyen, mais les gros écarts comptent beaucoup plus.',
    calcul: 'racine de la moyenne des (B − A)²',
  },
  ecartMax: {
    term: 'Écart max',
    definition: 'Plus grand écart observé entre A et B, avec l\'instant où il s\'est produit.',
    calcul: 'maximum des |B − A|',
  },
  ecartCumuls: {
    term: 'Écart des cumuls / des moyennes',
    definition: 'Écart global entre ce que mesurent A et B sur toute la période : cumul pour une énergie, moyenne sinon.',
    calcul: '(B − A) ÷ A × 100',
  },
  correlation: {
    term: 'Corrélation (r)',
    definition: 'Les deux courbes montent-elles et descendent-elles ensemble ? 1 = parfaitement ensemble, 0 = aucun lien.',
    calcul: 'coefficient de corrélation de Pearson entre A et B',
  },
  horsTolerance: {
    term: 'Hors tolérance',
    definition: 'Nombre (et part) des instants où A et B diffèrent plus que la tolérance choisie.',
    calcul: '|B − A| ÷ A × 100 > tolérance',
  },
  regression: {
    term: 'Régression B = a·A + b',
    definition: 'Droite qui relie les mesures de B à celles de A. a ≠ 1 : problème de calibrage ou de rapport de TC ; b ≠ 0 : décalage constant (charge fantôme, zéro mal réglé).',
    calcul: 'moindres carrés · R² = part de B expliquée par A (1 = parfait)',
  },
  r2: {
    term: 'R²',
    definition: 'Qualité de la droite de régression : 1 = les points sont parfaitement alignés, 0 = aucun lien.',
  },

  /* ------------------------------------------- compteur général / sous-compteurs */
  couverture: {
    term: 'Couverture',
    definition: 'Part de l\'énergie de l\'arrivée qui est effectivement mesurée par les sous-compteurs. 100 % = tout est suivi.',
    calcul: 'somme des départs ÷ arrivée × 100',
  },
  arrivee: {
    term: 'Arrivée',
    definition: 'Énergie mesurée par le compteur général, en tête de l\'installation.',
  },
  sommeDeparts: {
    term: 'Somme des départs',
    definition: 'Total de l\'énergie mesurée par les sous-compteurs (départs) sélectionnés.',
  },
  nonMesure: {
    term: 'Non mesuré',
    definition: 'Énergie qui passe par l\'arrivée mais par aucun sous-compteur : départs sans capteur, pertes.',
    calcul: 'arrivée − somme des départs',
  },
  surcompte: {
    term: 'Surcompté',
    definition: 'Les sous-compteurs mesurent plus que l\'arrivée : départ compté deux fois, capteur mal placé ou mal réglé.',
    calcul: 'somme des départs − arrivée',
  },

  /* ------------------------------------------------------------------ coupures */
  coupures: {
    term: 'Coupures',
    definition: 'Interruptions du réseau SENELEC détectées : les capteurs à pile continuent d\'émettre alors que les appareils branchés sur le secteur se taisent. Les fausses coupures écartées ne sont pas comptées.',
    calcul: 'appareils secteur muets alors que les capteurs à pile émettent, pendant au moins 5 min (trous de moins de 5 min fusionnés)',
  },
  dureeCumulee: {
    term: 'Durée cumulée',
    definition: 'Temps total passé sans électricité sur la période et les sites choisis.',
    calcul: 'somme des durées des coupures',
  },
  end: {
    term: 'Énergie non distribuée (END)',
    definition: 'Énergie que le site aurait consommée s\'il n\'y avait pas eu de coupure. C\'est une estimation.',
    calcul: 'puissance moyenne habituelle de l\'arrivée à la même heure (hors coupures et absences) × durée de la coupure ; pendant une absence déclarée, puissance de veille × durée',
  },
  causesConfirmees: {
    term: 'Causes confirmées',
    definition: 'Coupures dont la cause a été validée par une personne. Une cause proposée par le système ne compte pas tant qu\'elle n\'est pas confirmée.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
