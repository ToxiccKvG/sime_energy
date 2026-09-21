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
// Persistance durable côté serveur (17/09) : à la connexion, la bibliothèque
// de l'utilisateur (table measurement_files + bucket) est chargée ici ;
// chaque relevé ajouté, renommé ou retiré est répercuté en base, l'UI
// d'abord, le serveur ensuite — un échec remonte en toast, jamais en
// silence. Pas de localStorage (quota, échec silencieux).
// ============================================================

import { useSyncExternalStore } from 'react';
import type { MeasurementData } from './measurementService';
import type { DateRange } from '@/components/mesures/MeasurementPeriodFilter';
import { toast } from '@/hooks/use-toast';
import {
  loadMeasurementLibrary, createMeasurementFile, renameMeasurementFile, deleteMeasurementFile,
} from '@/lib/measurement-file-service';

export type WorkflowStep = 'upload' | 'analysis' | 'visualization' | 'models' | 'comparison';
export type ComparisonMode = 'models' | 'master';

export interface MeasurementSession {
  currentStep: WorkflowStep;
  measurementData: MeasurementData[];
  currentDataIndex: number;
  comparisonMode: ComparisonMode;
  /** Période choisie, par relevé — partagée entre Analyse, Visualisation et Modèles. */
  ranges: Record<number, DateRange>;
  /** Bibliothèque serveur : 'idle' avant connexion, 'loading', puis 'ready' (ou 'error'). */
  libraryStatus: 'idle' | 'loading' | 'ready' | 'error';
  /** Utilisateur dont la bibliothèque est chargée — pour repartir de zéro à un changement de compte. */
  libraryUserId: string | null;
}

const initial: MeasurementSession = {
  currentStep: 'upload',
  measurementData: [],
  currentDataIndex: 0,
  comparisonMode: 'models',
  ranges: {},
  libraryStatus: 'idle',
  libraryUserId: null,
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

// ---- Persistance serveur ----

function notifyError(title: string, e: unknown) {
  console.error('[Mesures]', title, e);
  toast({ title, description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
}

/**
 * Charge la bibliothèque de l'utilisateur (une fois par compte). Les relevés
 * déjà en session mais pas encore en base (envoi en cours) sont conservés.
 */
export async function ensureMeasurementLibrary(userId: string | null) {
  if (!userId) {
    if (state.libraryUserId) resetMeasurementSession();
    return;
  }
  if (state.libraryUserId === userId && state.libraryStatus !== 'idle') return;
  updateMeasurementSession({ libraryStatus: 'loading', libraryUserId: userId });
  try {
    const fromServer = await loadMeasurementLibrary((row, e) =>
      notifyError(`Relevé « ${row.alias ?? row.file_name} » illisible`, e));
    updateMeasurementSession((prev) => {
      const known = new Set(fromServer.map(d => d.id));
      const unsaved = prev.measurementData.filter(d => !d.id || !known.has(d.id));
      const measurementData = [...fromServer, ...unsaved];
      return {
        measurementData,
        libraryStatus: 'ready',
        currentDataIndex: Math.min(prev.currentDataIndex, Math.max(0, measurementData.length - 1)),
        currentStep: measurementData.length > 0 && prev.currentStep === 'upload' && prev.measurementData.length === 0 ? 'analysis' : prev.currentStep,
      };
    });
  } catch (e) {
    updateMeasurementSession({ libraryStatus: 'error' });
    notifyError('Impossible de charger vos relevés enregistrés', e);
  }
}

/** Ajoute des relevés à la session et les enregistre en base (UI d'abord). */
export function addMeasurements(data: MeasurementData[], userId: string | null, organizationId: string | null) {
  const stamped = data.map(d => ({ ...d, id: d.id ?? crypto.randomUUID() }));
  updateMeasurementSession((prev) => ({
    measurementData: [...prev.measurementData, ...stamped],
    currentStep: stamped.length > 0 ? 'analysis' : prev.currentStep,
  }));
  if (!userId) { notifyError('Relevés non enregistrés', new Error('Utilisateur non connecté')); return; }
  for (const d of stamped) {
    createMeasurementFile(d as MeasurementData & { id: string }, userId, organizationId)
      .catch(e => notifyError(`« ${d.file_name ?? 'relevé'} » n'a pas pu être enregistré sur le serveur`, e));
  }
}

export function renameMeasurement(index: number, alias: string) {
  const clean = alias.trim() || undefined;
  let id: string | undefined;
  updateMeasurementSession((prev) => ({
    measurementData: prev.measurementData.map((d, i) => { if (i === index) { id = d.id; return { ...d, alias: clean }; } return d; }),
  }));
  if (id) renameMeasurementFile(id, clean ?? null).catch(e => notifyError('Renommage non enregistré sur le serveur', e));
}

export function removeMeasurement(index: number) {
  let id: string | undefined;
  updateMeasurementSession((prev) => {
    id = prev.measurementData[index]?.id;
    const ranges: Record<number, DateRange> = {};
    Object.entries(prev.ranges).forEach(([k, v]) => {
      const i = Number(k);
      if (i < index) ranges[i] = v; else if (i > index) ranges[i - 1] = v;
    });
    const measurementData = prev.measurementData.filter((_, i) => i !== index);
    return {
      measurementData,
      ranges,
      currentDataIndex: Math.max(0, Math.min(prev.currentDataIndex, measurementData.length - 1)),
    };
  });
  if (id) deleteMeasurementFile(id).catch(e => notifyError('Suppression non enregistrée sur le serveur', e));
}
