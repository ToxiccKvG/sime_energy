// ============================================================
// IOT — Analyse : vues Environnement (min/max par jour, carte de chaleur,
// profil 24 h) et Signature énergétique. Extrait d'AnalyseTab.tsx (16/10).
// ============================================================

import { useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Scatter, Line, Area, ComposedChart, Brush,
} from 'recharts';
import { ResponsiveContainer } from '@/components/shared/ZoomableChart';
import { Badge } from '@/components/ui/badge';
import { usePalette, useChartPreferences, stopsChaleur } from '@/lib/chart-preferences';
import { CarteChaleur } from '@/components/shared/CarteChaleur';
import type { ShellyRow } from '../shared';
import { TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, colorForMetric, fmtFr, valeurGrandeur, type GrandeurDef } from './communs';

interface EnvDayAgg { jour: string; ts: number; range: [number, number]; moy: number; n: number }

function aggEnvByDay(rows: ShellyRow[], metric: string): EnvDayAgg[] {
  const byDay = new Map<string, { ts: number; vals: number[] }>();
  for (const r of rows) {
    const v = valeurGrandeur(r, metric);
    if (v === undefined) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    const key = d.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { ts: new Date(key).getTime(), vals: [] };
    cur.vals.push(v);
    byDay.set(key, cur);
  }
  return [...byDay.entries()]
    .map(([key, { ts, vals }]) => ({
      jour: new Date(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      ts,
      range: [Math.min(...vals), Math.max(...vals)] as [number, number],
      moy: vals.reduce((s, v) => s + v, 0) / vals.length,
      n: vals.length,
    }))
    .sort((a, b) => a.ts - b.ts);
}

// Vue 0 — Courbe : chaque relevé dans le temps (moyennés par paquets au-delà
// de 3 000 points). Seule vue lisible pour un fichier de quelques heures.
export function EnvCourbeView({ rows, g }: { rows: ShellyRow[]; g: GrandeurDef }) {
  const data = useMemo(() => {
    const pts = rows
      .map(r => ({ ts: (r.date instanceof Date ? r.date : new Date(r.date)).getTime(), v: valeurGrandeur(r, g.key) }))
      .filter((p): p is { ts: number; v: number } => p.v !== undefined)
      .sort((a, b) => a.ts - b.ts);
    const MAX = 3000;
    if (pts.length <= MAX) return pts;
    const taille = Math.ceil(pts.length / MAX);
    const out: { ts: number; v: number }[] = [];
    for (let i = 0; i < pts.length; i += taille) {
      const paquet = pts.slice(i, i + taille);
      out.push({ ts: paquet[0].ts, v: paquet.reduce((s, p) => s + p.v, 0) / paquet.length });
    }
    return out;
  }, [rows, g.key]);
  if (data.length === 0) {
    return <p className="text-slate-500 text-sm py-10 text-center">Aucune donnée « {g.label} » sur la période.</p>;
  }
  const duree = data[data.length - 1].ts - data[0].ts;
  const fmtTs = (ts: number) => new Date(ts).toLocaleString('fr-FR', duree > 2 * 86400000
    ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-slate-300 text-sm font-medium">{g.label} — relevés dans le temps</p>
        <span className="text-slate-500 text-xs">{data.length.toLocaleString('fr-FR')} points</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTs}
            tick={{ fill: '#cbd5e1', fontSize: 11 }} />
          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} domain={['auto', 'auto']}
            label={{ value: g.unit ? `${g.label} (${g.unit})` : g.label, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            labelFormatter={(ts: number) => new Date(ts).toLocaleString('fr-FR')}
            formatter={(value: number) => [`${fmtFr(value, 2)} ${g.unit}`, g.label]} />
          <Line dataKey="v" name={g.label} stroke={g.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          {/* Curseur de période : glisser les poignées pour zoomer sur une partie */}
          <Brush dataKey="ts" tickFormatter={fmtTs} height={22} stroke="#60a5fa" fill="rgba(255,255,255,0.04)" travellerWidth={8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Vue 1 — Bande min/max journalière + moyenne
export function EnvBandeView({ rows, g }: { rows: ShellyRow[]; g: GrandeurDef }) {
  const meta = g;
  const metric = g.key;
  const envColor = g.color;
  const data = useMemo(() => aggEnvByDay(rows, metric), [rows, metric]);
  if (data.length === 0) {
    return <p className="text-slate-500 text-sm py-10 text-center">Aucune donnée « {meta.label} » sur la période.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-slate-300 text-sm font-medium">{meta.label} — min / max / moyenne par jour</p>
        <span className="text-slate-500 text-xs">{data.length} jour{data.length > 1 ? 's' : ''}</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="jour" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} domain={['auto', 'auto']}
            label={{ value: meta.unit ? `${meta.label} (${meta.unit})` : meta.label, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value: number | [number, number], name: string) => {
              if (Array.isArray(value)) return [`${fmtFr(value[0], 1)} → ${fmtFr(value[1], 1)} ${meta.unit}`, 'Min → Max'];
              return [`${fmtFr(value, 1)} ${meta.unit}`, name];
            }} />
          <Area dataKey="range" name="Min → Max" stroke="none" fill={envColor} fillOpacity={0.18} connectNulls />
          <Line dataKey="moy" name="Moyenne" stroke={envColor} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Vue 2 — Carte de chaleur : heures en ordonnée (0 h en bas), jours en abscisse (en bas)
export function EnvHeatmapView({ rows, g }: { rows: ShellyRow[]; g: GrandeurDef }) {
  const meta = g;
  const metric = g.key;
  const palette = usePalette();
  const prefs = useChartPreferences();
  const { colonnes, valeurs } = useMemo(() => {
    // (jour local, heure locale) → moyenne. Jour et heure pris dans le même
    // fuseau : avant le 20/10, le jour était en UTC et l'heure en local.
    const acc = new Map<string, { ts: number; sums: number[]; counts: number[] }>();
    for (const r of rows) {
      const v = valeurGrandeur(r, metric);
      if (v === undefined) continue;
      const d = r.date instanceof Date ? r.date : new Date(r.date);
      const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const key = String(jour.getTime());
      const cur = acc.get(key) ?? { ts: jour.getTime(), sums: Array(24).fill(0), counts: Array(24).fill(0) };
      cur.sums[d.getHours()] += v;
      cur.counts[d.getHours()]++;
      acc.set(key, cur);
    }
    const jours = [...acc.values()].sort((a, b) => a.ts - b.ts);
    return {
      colonnes: jours.map(({ ts }) => {
        const date = new Date(ts);
        return {
          date,
          libelle: date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
          libelleComplet: date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
        };
      }),
      valeurs: jours.map(({ sums, counts }) => sums.map((s, h) => (counts[h] > 0 ? s / counts[h] : null))),
    };
  }, [rows, metric]);

  if (colonnes.length === 0) {
    return <p className="text-slate-500 text-sm py-10 text-center">Aucune donnée « {meta.label} » sur la période.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-slate-300 text-sm font-medium px-1">{meta.label} — moyenne par heure et par jour</p>
      <CarteChaleur
        colonnes={colonnes}
        valeurs={valeurs}
        stops={stopsChaleur(prefs, palette, g.color)}
        formatValeur={v => `${fmtFr(v, 1)}${meta.unit ? ` ${meta.unit}` : ''}`}
      />
    </div>
  );
}

// Vue 4 — Profil journalier moyen sur 24 h (moyenne par heure + bande ±1σ)
export function EnvProfil24View({ rows, g }: { rows: ShellyRow[]; g: GrandeurDef }) {
  const meta = g;
  const metric = g.key;
  const envColor = g.color;
  const data = useMemo(() => {
    const byHour: number[][] = Array.from({ length: 24 }, () => []);
    for (const r of rows) {
      const v = valeurGrandeur(r, metric);
      if (v === undefined) continue;
      const d = r.date instanceof Date ? r.date : new Date(r.date);
      byHour[d.getHours()].push(v);
    }
    return byHour.map((vals, h) => {
      if (vals.length === 0) return { heure: `${String(h).padStart(2, '0')}h`, moy: null, range: null, n: 0 };
      const moy = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - moy) ** 2, 0) / vals.length);
      return {
        heure: `${String(h).padStart(2, '0')}h`,
        moy: +moy.toFixed(2),
        range: [+(moy - std).toFixed(2), +(moy + std).toFixed(2)] as [number, number],
        n: vals.length,
      };
    });
  }, [rows, metric]);

  if (data.every(d => d.n === 0)) {
    return <p className="text-slate-500 text-sm py-10 text-center">Aucune donnée « {meta.label} » sur la période.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-slate-300 text-sm font-medium">{meta.label} — cycle journalier moyen (bande ±1σ)</p>
        <span className="text-slate-500 text-xs">{data.reduce((s, d) => s + d.n, 0).toLocaleString('fr-FR')} relevés</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="heure" tick={{ fill: '#cbd5e1', fontSize: 11 }} interval={1} />
          <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} domain={['auto', 'auto']}
            label={{ value: meta.unit ? `${meta.label} (${meta.unit})` : meta.label, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value: number | [number, number], name: string) => {
              if (Array.isArray(value)) return [`${fmtFr(value[0], 1)} → ${fmtFr(value[1], 1)} ${meta.unit}`, '±1σ'];
              return [`${fmtFr(value, 1)} ${meta.unit}`, name];
            }} />
          <Area dataKey="range" name="±1σ" stroke="none" fill={envColor} fillOpacity={0.18} connectNulls />
          <Line dataKey="moy" name="Moyenne" stroke={envColor} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Vue 3 — Signature énergétique : consommation journalière vs température
// moyenne extérieure. Nuage de points + droite de régression : la pente
// (kWh/°C) mesure la sensibilité thermique du site (clim/chauffage).
export function SignatureView({ envRows, energyRows }: { envRows: ShellyRow[]; energyRows: ShellyRow[] }) {
  const couleurConso = colorForMetric(usePalette(), 'kwhTotal');
  const { points, reg } = useMemo(() => {
    const byDay = new Map<string, { temps: number[]; kwh: number }>();
    for (const r of envRows) {
      if (typeof r.temperature !== 'number' || !isFinite(r.temperature)) continue;
      const key = (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { temps: [], kwh: 0 };
      cur.temps.push(r.temperature);
      byDay.set(key, cur);
    }
    for (const r of energyRows) {
      const key = (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0, 10);
      const cur = byDay.get(key);
      if (cur) cur.kwh += r.kwhTotal ?? 0;
    }
    const points = [...byDay.entries()]
      .filter(([, v]) => v.temps.length > 0 && v.kwh > 0)
      .map(([key, v]) => ({
        x: +(v.temps.reduce((s, t) => s + t, 0) / v.temps.length).toFixed(2),
        y: +v.kwh.toFixed(3),
        jour: new Date(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      }))
      .sort((a, b) => a.x - b.x);

    // Régression linéaire y = a·x + b, et R²
    let reg: { a: number; b: number; r2: number; line: { x: number; y: number }[] } | null = null;
    if (points.length >= 3) {
      const n = points.length;
      const mx = points.reduce((s, p) => s + p.x, 0) / n;
      const my = points.reduce((s, p) => s + p.y, 0) / n;
      const sxy = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
      const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
      const syy = points.reduce((s, p) => s + (p.y - my) ** 2, 0);
      if (sxx > 0 && syy > 0) {
        const a = sxy / sxx;
        const b = my - a * mx;
        const r2 = (sxy * sxy) / (sxx * syy);
        const xMin = points[0].x, xMax = points[points.length - 1].x;
        reg = { a, b, r2, line: [{ x: xMin, y: a * xMin + b }, { x: xMax, y: a * xMax + b }] };
      }
    }
    return { points, reg };
  }, [envRows, energyRows]);

  if (points.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-10 text-center">
        Aucun jour ne combine température et consommation — vérifiez que la période chargée couvre les deux types d'appareils.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <p className="text-slate-300 text-sm font-medium">Consommation journalière vs température moyenne</p>
        {reg && (
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-orange-500/20 text-orange-300 border-0">
              Pente : {fmtFr(reg.a, 2)} kWh/°C
            </Badge>
            <Badge className={`border-0 ${reg.r2 >= 0.5 ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-slate-400'}`}>
              R² = {fmtFr(reg.r2, 2)}{reg.r2 < 0.5 ? ' (corrélation faible)' : ''}
            </Badge>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={points} margin={{ top: 5, right: 20, bottom: 15, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{ fill: '#cbd5e1', fontSize: 11 }}
            label={{ value: 'Température moyenne du jour (°C)', position: 'insideBottom', offset: -8, fill: '#94a3b8', fontSize: 11 }} />
          <YAxis dataKey="y" tick={{ fill: '#cbd5e1', fontSize: 10 }} domain={['auto', 'auto']}
            label={{ value: 'Consommation (kWh/jour)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value: number, name: string) =>
              name === 'Consommation' ? [`${fmtFr(value, 2)} kWh`, name] : [`${fmtFr(value, 1)} °C`, name]}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as { jour?: string })?.jour ?? ''} />
          <Scatter dataKey="y" name="Consommation" fill={couleurConso} />
          {reg && (
            <Line data={reg.line} dataKey="y" name="Régression" stroke="#22d3ee"
              strokeWidth={2} strokeDasharray="6 3" dot={false} legendType="none" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-slate-500 text-xs px-1">
        Chaque point = 1 jour. Une pente positive élevée indique une consommation sensible à la chaleur
        (climatisation) : la pente chiffre le surcoût en kWh par degré supplémentaire.
      </p>
    </div>
  );
}

