/**
 * Registre des modèles d'analyse : identifiant, question d'audit à laquelle
 * il répond, et condition d'applicabilité déduite de la nature des données.
 */

import type { QuantityKind } from '@/services/measurementStats';

export type ModelId = 'profilType' | 'talon' | 'anomalies' | 'avantApres';

export interface ModelMeta {
  id: ModelId;
  label: string;
  question: string;
  /** Message expliquant pourquoi le modèle ne s'applique pas, ou null s'il s'applique. */
  notApplicable: (kind: QuantityKind, subDaily: boolean, days: number) => string | null;
}

export const ANALYSIS_MODELS: ModelMeta[] = [
  {
    id: 'profilType',
    label: 'Profil type',
    question: 'À quoi ressemble une journée typique ?',
    notApplicable: (_k, _s, days) => (days < 2 ? 'Il faut au moins deux journées de mesures.' : null),
  },
  {
    id: 'talon',
    label: 'Talon',
    question: 'Qu\'est-ce qui consomme quand rien ne devrait tourner ?',
    notApplicable: (k, s) =>
      k === 'other' ? 'Réservé aux puissances et énergies.' : !s ? 'Demande des mesures infra-journalières.' : null,
  },
  {
    id: 'anomalies',
    label: 'Anomalies',
    question: 'Que s\'est-il passé d\'anormal ?',
    notApplicable: () => null,
  },
  {
    id: 'avantApres',
    label: 'Avant / Après',
    question: 'L\'action a-t-elle rapporté ?',
    notApplicable: (_k, _s, days) => (days < 2 ? 'Il faut au moins une journée de chaque côté de la coupure.' : null),
  },
];

export * from './types';
export * from './profilType';
export * from './talon';
export * from './anomalies';
export * from './avantApres';
