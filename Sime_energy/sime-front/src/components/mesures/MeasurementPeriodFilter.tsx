/**
 * Filtre de période partagé entre les onglets Analyse et Visualisation du
 * module Campagne de mesure : même plage, mêmes helpers, même rendu.
 */

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toDate } from '@/services/measurementStats';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

/** Plage locale au format <input type="datetime-local"> ("YYYY-MM-DDTHH:MM"), null = fichier complet. */
export type DateRange = { start: string; end: string } | null;

/** epoch ms → valeur compatible avec un <input type="datetime-local"> (heure locale). */
export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Plage couvrant exactement le jour "YYYY-MM-DD". */
export function dayRangeOf(day: string): NonNullable<DateRange> {
  return { start: `${day}T00:00`, end: `${day}T23:59` };
}

/** "YYYY-MM-DD" si la plage couvre exactement un jour, sinon null. */
export function singleDayOf(range: DateRange): string | null {
  if (!range) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T00:00$/.exec(range.start);
  return m && range.end === `${m[1]}T23:59` ? m[1] : null;
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/** Bornes temporelles réelles d'un jeu de mesures (epoch ms), null si vide. */
export function useTimestampBounds(measurements: { timestamp?: unknown }[]): { min: number; max: number } | null {
  return useMemo(() => {
    const times = measurements
      .map((m) => toDate(String(m.timestamp)).getTime())
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) return null;
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [measurements]);
}

/** Mesures dont l'horodatage tombe dans la plage (ou toutes si plage nulle). */
export function filterByRange<T extends { timestamp?: unknown }>(
  measurements: T[],
  range: DateRange,
  bounds: { min: number; max: number } | null,
): T[] {
  if (!range || !bounds) return measurements;
  const start = range.start ? new Date(range.start).getTime() : bounds.min;
  const end = range.end ? new Date(range.end).getTime() : bounds.max;
  return measurements.filter((m) => {
    const t = toDate(String(m.timestamp)).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  });
}

interface PeriodFilterProps {
  bounds: { min: number; max: number } | null;
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function PeriodFilter({ bounds, value, onChange }: PeriodFilterProps) {
  if (!bounds || bounds.max <= bounds.min) return null;
  const day = singleDayOf(value);
  const minDay = toDatetimeLocalValue(bounds.min).slice(0, 10);
  const maxDay = toDatetimeLocalValue(bounds.max).slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground mr-1">Période :</span>
      <Input
        type="datetime-local"
        className="h-8 w-auto text-xs"
        value={value?.start ?? toDatetimeLocalValue(bounds.min)}
        onChange={(e) => onChange({ start: e.target.value, end: value?.end ?? toDatetimeLocalValue(bounds.max) })}
      />
      <span className="text-xs text-muted-foreground">à</span>
      <Input
        type="datetime-local"
        className="h-8 w-auto text-xs"
        value={value?.end ?? toDatetimeLocalValue(bounds.max)}
        onChange={(e) => onChange({ start: value?.start ?? toDatetimeLocalValue(bounds.min), end: e.target.value })}
      />
      {day && (
        <div className="flex items-center gap-1 ml-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Jour précédent"
            disabled={day <= minDay} onClick={() => onChange(dayRangeOf(shiftDay(day, -1)))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium tabular-nums">{day.split('-').reverse().join('/')}</span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Jour suivant"
            disabled={day >= maxDay} onClick={() => onChange(dayRangeOf(shiftDay(day, 1)))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {value !== null && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange(null)}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Période complète
        </Button>
      )}
    </div>
  );
}
