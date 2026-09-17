// ============================================================
// Session du module Mesures — survit à la navigation
//
// Le workflow tenait ses relevés dans un useState de la page : quitter
// /mesures (pour IOT, un audit…) démontait la page et perdait tout,
// l'utilisateur recommençait à zéro en revenant. L'état vit désormais ici,
// au niveau du module JS, et les composants s'y abonnent avec
// useSyncExternalStore : il traverse les changements de route et ne
// disparaît qu'au rechargement complet de la page.
//
// Volontairement PAS de localStorage : les relevés (C.A 8335 à 10 min sur
// plusieurs semaines, colonnes secondaires…) dépassent vite le quota, et
// une sauvegarde qui échoue en silence est pire que pas de sauvegarde
// (leçon du module IOT). La persistance durable est un chantier serveur.
// ============================================================

import { useSyncExternalStore } from 'react';
import type { MeasurementData } from './measurementService';
import type { DateRange } from '@/components/invoices/MeasurementPeriodFilter';

export type WorkflowStep = 'upload' | 'analysis' | 'visualization' | 'models' | 'comparison';
export type ComparisonMode = 'models' | 'master';

export interface MeasurementSession {
  currentStep: WorkflowStep;
  measurementData: MeasurementData[];
  currentDataIndex: number;
  comparisonMode: ComparisonMode;
  /** Période choisie, par relevé — partagée entre Analyse, Visualisation et Modèles. */
  ranges: Record<number, DateRange>;
}

const initial: MeasurementSession = {
  currentStep: 'upload',
  measurementData: [],
  currentDataIndex: 0,
  comparisonMode: 'models',
  ranges: {},
};

let state: MeasurementSession = initial;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

export function getMeasurementSession(): MeasurementSession { return state; }

export function updateMeasurementSession(patch: Partial<MeasurementSession> | ((prev: MeasurementSession) => Partial<MeasurementSession>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

export function resetMeasurementSession() { state = initial; emit(); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Lecture réactive de la session ; les mises à jour passent par updateMeasurementSession. */
export function useMeasurementSession(): MeasurementSession {
  return useSyncExternalStore(subscribe, getMeasurementSession, getMeasurementSession);
}
