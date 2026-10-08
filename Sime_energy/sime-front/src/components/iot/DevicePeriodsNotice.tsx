// ============================================================
// IOT — Avertissement « capteur déplacé » au chargement Supabase
//
// Si la période demandée couvre plusieurs affectations d'un même capteur
// (table shelly_device_periodes), les données mélangeraient plusieurs
// appareils réels sous un seul nom. On le dit, on liste les affectations
// et on propose de commencer à l'affectation actuelle. Rien n'est coupé
// d'office : l'utilisateur garde la main sur ses dates.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchDevicePeriodes, periodesInRange, type DevicePeriode } from '@/lib/shelly-device-period-service';

const DAY_MS = 86_400_000;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });

/** Date (AAAA-MM-JJ, UTC comme le chargement) à partir de laquelle seule l'affectation actuelle est couverte. */
function startOfCurrent(inRange: DevicePeriode[]): string {
  const current = inRange[inRange.length - 1];
  const day = current.du.slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00Z`).getTime();
  // L'affectation précédente déborde sur le jour du changement : on commence le lendemain.
  const overlap = inRange.slice(0, -1).some(p => p.au != null && new Date(p.au).getTime() > dayStart);
  return overlap ? new Date(dayStart + DAY_MS).toISOString().slice(0, 10) : day;
}

export function DevicePeriodsNotice({ deviceIds, deviceName, dateDebut, dateFin, onStartAt }: {
  deviceIds: string[];
  deviceName: (id: string) => string;
  dateDebut: string;
  dateFin: string;
  onStartAt: (date: string) => void;
}) {
  const [periodes, setPeriodes] = useState<DevicePeriode[]>([]);
  useEffect(() => {
    fetchDevicePeriodes().then(setPeriodes).catch(() => setPeriodes([]));
  }, []);

  const concerned = useMemo(() => {
    if (!periodes.length || !dateDebut || !dateFin) return [];
    const from = new Date(`${dateDebut}T00:00:00Z`);
    const to = new Date(new Date(`${dateFin}T00:00:00Z`).getTime() + DAY_MS);
    return deviceIds
      .map(id => ({ id, inRange: periodesInRange(periodes, id, from, to) }))
      .filter(d => d.inRange.length > 1 || d.inRange.some(p => p.statut === 'incertain'));
  }, [periodes, deviceIds, dateDebut, dateFin]);

  if (concerned.length === 0) return null;

  const multi = concerned.filter(d => d.inRange.length > 1);
  const startAt = multi.length ? multi.map(d => startOfCurrent(d.inRange)).sort().at(-1)! : null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs space-y-2">
      <p className="flex items-center gap-1.5 text-amber-200 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {multi.length
          ? `Sur cette période, ${multi.length > 1 ? 'des capteurs ont' : 'un capteur a'} mesuré plusieurs appareils différents`
          : 'Appareil mesuré incertain sur une partie de la période'}
      </p>
      <ul className="space-y-1.5">
        {concerned.map(({ id, inRange }) => (
          <li key={id}>
            <span className="text-slate-200">{deviceName(id)}</span>
            <ul className="mt-0.5 space-y-0.5 text-slate-400">
              {inRange.map(p => (
                <li key={p.du} title={p.notes ?? undefined}>
                  {fmtDate(p.du)} → {p.au ? fmtDate(p.au) : 'aujourd\'hui'} : <span className="text-slate-300">{p.libelle}</span> ({p.site})
                  {p.statut === 'incertain' && <span className="ml-1 text-amber-300">· appareil incertain</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {startAt && startAt > dateDebut && startAt <= dateFin && (
        <button className="text-amber-200 underline underline-offset-2 hover:text-white" onClick={() => onStartAt(startAt)}>
          Commencer à l'affectation actuelle (au {fmtDate(`${startAt}T00:00:00Z`)})
        </button>
      )}
    </div>
  );
}
