// ============================================================
// Service — Périodes d'affectation des capteurs Shelly
// Table : shelly_device_periodes (migration 20261008)
//
// Un même device_id a parfois mesuré plusieurs appareils réels
// (prise déplacée d'une machine à laver vers un ventilateur, compteur
// passé de l'Académie à Donsin…). Seuls les capteurs déplacés ont des
// lignes ; un appareil absent de la table n'a jamais changé d'affectation.
// ============================================================

import { supabase } from '@/lib/supabase';

export interface DevicePeriode {
  device_id: string;
  du: string;
  /** null = affectation en cours. Borne exclusive. */
  au: string | null;
  site: string;
  libelle: string;
  statut: 'confirme' | 'incertain';
  notes: string | null;
}

export async function fetchDevicePeriodes(): Promise<DevicePeriode[]> {
  const { data, error } = await supabase
    .from('shelly_device_periodes')
    .select('device_id,du,au,site,libelle,statut,notes')
    .order('du');
  if (error) throw error;
  return (data ?? []) as DevicePeriode[];
}

/** Périodes d'un capteur qui recoupent l'intervalle [from, to[. */
export function periodesInRange(periodes: DevicePeriode[], deviceId: string, from: Date, to: Date): DevicePeriode[] {
  return periodes.filter(p =>
    p.device_id === deviceId
    && new Date(p.du) < to
    && (p.au == null || new Date(p.au) > from));
}

/** Affectation en vigueur à une date (null si le capteur n'en a aucune ce jour-là). */
export function periodeAt(periodes: DevicePeriode[], deviceId: string, at: Date): DevicePeriode | null {
  return periodes.find(p =>
    p.device_id === deviceId
    && new Date(p.du) <= at
    && (p.au == null || new Date(p.au) > at)) ?? null;
}
