// ============================================================
// Dashboard IOT — Qualité 3 phases (tension, courant, déséquilibre)
//
// Le titre nomme le compteur réellement mesuré : la carte prend le
// premier triphasé qui remonte une tension, ce qui n'est pas forcément
// l'arrivée réseau. À l'Académie CER2E, M1/M2/M3 étant hors ligne, le
// seul candidat est le départ PV — parler de « qualité réseau » y était
// donc faux. Le sélecteur reste visible même à un seul candidat, pour
// que le choix par défaut soit lisible et non subi.
// ============================================================

import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ShellyClRow } from '@/lib/iot-dashboard-service';
import type { PlageDetail } from '@/lib/iot-energy-detail-service';
import { EnergyDetailDialog, type EnergyMetricKey, type EnergySubject } from './EnergyDetailDialog';

const fmtFr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface Props {
  snapshot: ShellyClRow[];
  /** Période analysée par la popup de détail. */
  plage: PlageDetail;
}

// Une tuile de phase est un bouton : elle ouvre l'historique de la grandeur.
const TUILE_CLIC =
  'text-center w-full cursor-pointer transition-shadow hover:ring-1 hover:ring-white/25 ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40';

export function PhaseQualityCard({ snapshot, plage }: Props) {
  const [detail, setDetail] = useState<EnergySubject | null>(null);
  const meters3PH = useMemo(
    () => snapshot.filter(r => r.device_family === 'ENERGIE_3PH' && r.v_a != null),
    [snapshot],
  );
  const [selectedId, setSelectedId] = useState<string>('');

  // Auto-sélection : si rien choisi, prendre le premier
  const current = useMemo(() => {
    if (meters3PH.length === 0) return undefined;
    return meters3PH.find(r => r.device_id === selectedId) ?? meters3PH[0];
  }, [meters3PH, selectedId]);

  if (meters3PH.length === 0) return null;

  const c = current!;
  const v = [c.v_a, c.v_b, c.v_c].map(x => Number(x ?? 0));
  const i = [c.i_a, c.i_b, c.i_c].map(x => Number(x ?? 0));
  const p = [c.p_a, c.p_b, c.p_c].map(x => Number(x ?? 0));

  const avgV = (v[0] + v[1] + v[2]) / 3;
  const maxV = Math.max(...v);
  const minV = Math.min(...v.filter(x => x > 0).length > 0 ? v.filter(x => x > 0) : [0]);
  const desequilibre = avgV > 0 ? ((maxV - minV) / avgV) * 100 : 0;

  const PHASES = ['A', 'B', 'C'];
  const COLORS_V = ['#22c55e', '#f59e0b', '#ec4899'];

  /**
   * Détail d'une grandeur du compteur affiché.
   *
   * Le courant n'a pas d'agrégat horaire : shelly_cl_horaire ne stocke que
   * puissance et tension. Cliquer un courant ouvre donc la puissance par
   * phase — c'est la même information à un facteur de tension près — et la
   * note le dit, plutôt que de tracer un courant reconstitué en le faisant
   * passer pour mesuré.
   */
  const ouvrir = (metrique: EnergyMetricKey, titre: string, notes?: string[]) => setDetail({
    titre,
    sousTitre: `${c.name} · ${c.site}${c.room ? ' · ' + c.room : ''}`,
    couleur: '#22d3ee',
    plage,
    series: [{
      label: c.name,
      couleur: '#22d3ee',
      devices: [{ device_id: c.device_id, name: c.name, site: c.site, room: c.room }],
    }],
    metriqueInitiale: metrique,
    notes,
    instantane: [
      { label: 'Maintenant', valeur: `${fmtFr(v[0], 0)} / ${fmtFr(v[1], 0)} / ${fmtFr(v[2], 0)} V` },
      { label: '·', valeur: `${fmtFr(i[0], 1)} / ${fmtFr(i[1], 1)} / ${fmtFr(i[2], 1)} A` },
    ],
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4 text-cyan-400" /> Qualité 3 phases
        </h3>
        {meters3PH.length >= 1 && (
          <Select value={c.device_id} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full sm:w-56 h-7 text-xs bg-white/5 border-white/20 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {meters3PH.map(m => <SelectItem key={m.device_id} value={m.device_id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-slate-400 text-xs mb-3">
        Mesuré sur <span className="text-white font-medium">{c.name}</span> · {c.site}{c.room ? ' · ' + c.room : ''}
        {meters3PH.length === 1 && (
          <span className="text-amber-500/80"> · seul triphasé actif</span>
        )}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        {/* Tensions */}
        {v.map((val, idx) => {
          const ok = val >= 220 && val <= 245;
          const warn = (val >= 200 && val < 220) || (val > 245 && val <= 250);
          const color = val === 0 ? '#64748b' : ok ? '#22c55e' : warn ? '#f59e0b' : '#ef4444';
          return (
            <button key={`v-${idx}`} type="button"
              onClick={() => ouvrir('tension', `Tensions — ${c.name}`)}
              title="Voir l'historique des tensions"
              className={`rounded-lg border bg-white/5 border-white/10 p-3 ${TUILE_CLIC}`}>
              <p className="text-[10px] text-slate-400 uppercase">Tension Phase {PHASES[idx]}</p>
              <p className="text-2xl font-bold mt-1" style={{ color }}>
                {fmtFr(val, 1)} <span className="text-xs font-normal text-slate-400">V</span>
              </p>
              <div className="h-1 mt-2 rounded-full overflow-hidden bg-white/10">
                <div className="h-full" style={{ width: `${Math.min(100, val / 260 * 100)}%`, backgroundColor: color }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">cible 220-245 V</p>
            </button>
          );
        })}

        {/* Courants */}
        {i.map((val, idx) => (
          <button key={`i-${idx}`} type="button"
            onClick={() => ouvrir('phases', `Puissance par phase — ${c.name}`, [
              "Le courant n'est pas agrégé à l'heure : la courbe montre la puissance par phase, dont le courant se déduit à tension quasi constante (I ≈ P / U)",
            ])}
            title="Voir l'historique de la charge par phase"
            className={`rounded-lg border bg-white/5 border-white/10 p-3 ${TUILE_CLIC}`}>
            <p className="text-[10px] text-slate-400 uppercase">Courant Phase {PHASES[idx]}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: COLORS_V[idx] }}>
              {fmtFr(val, 1)} <span className="text-xs font-normal text-slate-400">A</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-2">{fmtFr(p[idx], 1)} W</p>
          </button>
        ))}

        <button type="button"
          onClick={() => ouvrir('tension', `Déséquilibre de tension — ${c.name}`, [
            'Déséquilibre = (max − min) / moyenne des trois tensions, calculé heure par heure',
          ])}
          title="Voir l'historique du déséquilibre"
          className={`col-span-2 sm:col-span-3 rounded-lg p-3 border ${TUILE_CLIC} ${
          desequilibre > 5 ? 'bg-amber-500/10 border-amber-500/30' :
          desequilibre > 2 ? 'bg-yellow-500/5 border-yellow-500/20' :
                              'bg-green-500/5 border-green-500/20'
        }`}>
          <p className="text-[10px] text-slate-400 uppercase">Déséquilibre tension entre phases</p>
          <p className="text-xl font-bold mt-1" style={{
            color: desequilibre > 5 ? '#f59e0b' : desequilibre > 2 ? '#facc15' : '#22c55e',
          }}>
            {fmtFr(desequilibre, 2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            (max - min) / moyenne · alerte si &gt; 5%
          </p>
        </button>
      </div>

      <EnergyDetailDialog sujet={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
