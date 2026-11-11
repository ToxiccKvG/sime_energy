// ============================================================
// IOT — Analyse : vue États (portes, mouvement, bouton, relais) et
// vue Comparaison des sites. Les calculs sont ceux du rapport
// (services/iotRapportCapteurs.ts) : l'écran et le fichier disent la même chose.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { ResponsiveContainer } from '@/components/shared/ZoomableChart';
import { fetchDisponibles } from '@/lib/iot-supabase-service';
import { fetchEtatsAppareils, type EtatAppareil, type LigneCapteur, type PerimetreRapport } from '@/lib/iot-rapport-service';
import { construireCapteurs, tableauComparaisonSites } from '@/services/iotRapportCapteurs';
import { TRANCHES_DEFAUT } from '@/services/iotRapportAnalyses';
import type { Tableau } from '@/services/iotRapport';
import type { ShellyRow } from '../shared';
import { fmtFr, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './communs';

const toDate = (d: ShellyRow['date']) => (d instanceof Date ? d : new Date(d as unknown as string));

/** Un tableau du rapport, à l'écran : mêmes colonnes, mêmes formats. */
export function TableauRapport({ t }: { t: Tableau }) {
  const texte = (v: string | number | Date | null, format?: string) => {
    if (v == null) return '—';
    if (v instanceof Date) return v.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
    if (typeof v === 'string') return v;
    if (format === 'pct') return `${fmtFr(v * 100, 0)} %`;
    if (format === 'kwh' || format === 'decimal') return fmtFr(v, format === 'kwh' ? 2 : 1);
    return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  };
  return (
    <div className="overflow-x-auto">
      {t.note && <p className="text-xs text-slate-500 mb-2">{t.note}</p>}
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            {t.colonnes.map(c => (
              <th key={c.titre} className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap border-b border-white/10">{c.titre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.lignes.map((l, i) => (
            <tr key={i} className="border-t border-white/5 hover:bg-white/5">
              {l.map((v, j) => {
                const f = t.colonnes[j]?.format;
                return <td key={j} className={`px-2 py-1.5 text-slate-300 ${f === 'texte' ? '' : 'text-right whitespace-nowrap'}`}>{texte(v, f)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Les capteurs d'état du chargement : ce qu'ils ont fait, et à quelle heure. */
export function VueEtats({ rows, perimetre }: { rows: ShellyRow[]; perimetre: PerimetreRapport | null }) {
  const appareils = useMemo(() => {
    const m = new Map<string, { nom: string; site: string }>();
    for (const r of rows) if (r.deviceId && !m.has(r.deviceId)) m.set(r.deviceId, { nom: r.nomAppareil ?? r.deviceId, site: r.deviceLocation ?? '' });
    return m;
  }, [rows]);
  const [etats, setEtats] = useState<EtatAppareil[] | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [chargement, setChargement] = useState(false);
  const [echecs, setEchecs] = useState(0);
  const cle = perimetre ? JSON.stringify([perimetre, [...appareils.keys()].sort()]) : '';

  useEffect(() => {
    if (!perimetre) return;
    let annule = false;
    setChargement(true);
    setEtats(null);
    fetchDisponibles()
      .then(async d => {
        const etatIds = d.devices.filter(x => x.device_family === 'ETAT' && appareils.has(x.device_id)).map(x => x.device_id);
        if (annule) return;
        setIds(etatIds);
        const res = await fetchEtatsAppareils(perimetre, etatIds);
        if (!annule) { setEtats(res.etats); setEchecs(res.echecs); }
      })
      .catch(() => { if (!annule) setEtats([]); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const rapport = useMemo(() => {
    if (!etats) return null;
    const lignes: LigneCapteur[] = ids.map(id => ({
      ts: new Date(), site: appareils.get(id)?.site ?? '', deviceId: id, nom: appareils.get(id)?.nom ?? id,
      famille: 'ETAT', type: null, valeurs: {}, nbMesures: 1,
    }));
    return construireCapteurs({ lignes, etats, tranches: TRANCHES_DEFAUT });
  }, [etats, ids, appareils]);

  const parHeure = useMemo(() => {
    const t = rapport?.etatsParHeure;
    if (!t) return [];
    return t.lignes.map(l => ({ heure: l[0], total: (l.slice(1) as number[]).reduce((s, v) => s + (v ?? 0), 0) }));
  }, [rapport]);

  if (!perimetre) return <p className="text-slate-500 text-sm py-10 text-center">La vue États lit les capteurs de la base Shelly : chargez un site.</p>;
  if (chargement) {
    return <p className="text-slate-400 text-sm py-10 text-center flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Lecture des changements d'état…</p>;
  }
  if (!rapport?.etats) return <p className="text-slate-500 text-sm py-10 text-center">Aucun capteur d'état sur ce chargement.</p>;

  return (
    <div className="space-y-4">
      {echecs > 0 && <p className="text-xs text-amber-300">{echecs} capteur{echecs > 1 ? 's' : ''} non lu{echecs > 1 ? 's' : ''} : la lecture a été trop longue, souvent parce que plusieurs calculs tournent en même temps. Rechargez pour réessayer.</p>}
      {parHeure.some(x => x.total > 0) && (
        <div>
          <h3 className="text-white font-semibold text-sm mb-2">Activité selon l'heure (tous capteurs d'état)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={parHeure} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="heure" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="total" name="Événements" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <TableauRapport t={rapport.etats} />
    </div>
  );
}

/** Énergie de chaque site, sur la série principale (lignes déjà sans double comptage). */
export function VueComparaisonSites({ rows }: { rows: ShellyRow[] }) {
  const t = useMemo(() => {
    const parSite = new Map<string, { kwh: number; jours: Set<string>; heures: Set<number>; jour: number; nuit: number; soir: number }>();
    for (const r of rows) {
      const site = r.deviceLocation ?? '—';
      const d = toDate(r.date);
      const c = parSite.get(site) ?? { kwh: 0, jours: new Set<string>(), heures: new Set<number>(), jour: 0, nuit: 0, soir: 0 };
      const kwh = r.kwhTotal ?? 0;
      const h = d.getHours();
      c.kwh += kwh;
      c.jours.add(d.toDateString());
      c.heures.add(Math.floor(d.getTime() / 3_600_000));
      if (h >= TRANCHES_DEFAUT.jourDebut && h < TRANCHES_DEFAUT.jourFin) c.jour += kwh; else c.nuit += kwh;
      if (h >= TRANCHES_DEFAUT.soirDebut && h < TRANCHES_DEFAUT.soirFin) c.soir += kwh;
      parSite.set(site, c);
    }
    const tableau = tableauComparaisonSites([...parSite].map(([site, c]) => ({
      site, nature: 'Série principale', kwh: c.kwh, jours: c.jours.size, heures: c.heures.size,
      jourKwh: c.jour, nuitKwh: c.nuit, soirKwh: c.soir, pMax: null, talon: null,
    })));
    // À l'écran, ni pic ni talon : ils ne sont calculés que pour le rapport
    const garder = tableau.colonnes.map((c, i) => (c.titre === 'P max (W)' || c.titre === 'Talon nuit (W)' ? -1 : i)).filter(i => i >= 0);
    return {
      note: 'Série principale de chaque site, sans additionner arrivée et départs. Jour 7 h–19 h, nuit 19 h–7 h, soirée 19 h–23 h.',
      colonnes: garder.map(i => tableau.colonnes[i]),
      lignes: tableau.lignes.map(l => garder.map(i => l[i])),
    } as Tableau;
  }, [rows]);
  const barres = t.lignes.map(l => ({ site: l[0] as string, kwh: l[2] as number }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-semibold text-sm mb-2">Énergie par site</h3>
        <ResponsiveContainer width="100%" height={Math.max(180, barres.length * 44)}>
          <BarChart data={barres} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" unit=" kWh" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis type="category" dataKey="site" width={150} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${fmtFr(v, 2)} kWh`, 'Énergie']} />
            <Bar dataKey="kwh" fill="#3b82f6" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableauRapport t={t} />
    </div>
  );
}
