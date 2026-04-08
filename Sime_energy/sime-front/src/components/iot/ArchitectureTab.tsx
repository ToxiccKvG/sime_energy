import type { IotTabProps } from './shared';

export function ArchitectureTab({ siteId }: IotTabProps) {
  return (
    <div className="space-y-4">
      {/* Schéma unifilaire SVG */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 text-sm font-medium text-slate-200">Schéma unifilaire — Points de mesure M1–M5</div>
        <div className="overflow-x-auto">
          <svg width="100%" viewBox="0 0 640 360" className="block mx-auto max-w-2xl">
            <defs>
              <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>
            {/* M1 Réseau */}
            <rect x="20" y="28" width="130" height="56" rx="8" fill="#1e3a5f" stroke="#185FA5" strokeWidth="1.5"/>
            <text fontFamily="system-ui" fontSize="12" fontWeight="500" fill="#93c5fd" x="85" y="50" textAnchor="middle">M1 — Réseau public</text>
            <text fontFamily="system-ui" fontSize="10" fill="#60a5fa" x="85" y="68" textAnchor="middle">Senelec · HP/HC · FCFA</text>
            {/* M5 PV */}
            <rect x="20" y="148" width="130" height="56" rx="8" fill="#14382a" stroke="#3B6D11" strokeWidth="1.5"/>
            <text fontFamily="system-ui" fontSize="12" fontWeight="500" fill="#86efac" x="85" y="170" textAnchor="middle">M5 — PV + Batt.</text>
            <text fontFamily="system-ui" fontSize="10" fill="#4ade80" x="85" y="188" textAnchor="middle">Solaire prioritaire</text>
            {/* M4 GE */}
            <rect x="20" y="268" width="130" height="56" rx="8" fill="#3b1f0a" stroke="#854F0B" strokeWidth="1.5"/>
            <text fontFamily="system-ui" fontSize="12" fontWeight="500" fill="#fcd34d" x="85" y="290" textAnchor="middle">M4 — GE</text>
            <text fontFamily="system-ui" fontSize="10" fill="#f59e0b" x="85" y="308" textAnchor="middle">Groupe secours</text>
            {/* M2 Sélecteur */}
            <rect x="255" y="148" width="120" height="56" rx="8" fill="#3b1409" stroke="#993C1D" strokeWidth="1.5"/>
            <text fontFamily="system-ui" fontSize="12" fontWeight="500" fill="#fca5a5" x="315" y="170" textAnchor="middle">M2 — Sélecteur</text>
            <text fontFamily="system-ui" fontSize="10" fill="#f87171" x="315" y="188" textAnchor="middle">Inverseur / ATS</text>
            {/* M3 Charge */}
            <rect x="490" y="148" width="130" height="56" rx="8" fill="#1e1b4b" stroke="#534AB7" strokeWidth="1.5"/>
            <text fontFamily="system-ui" fontSize="12" fontWeight="500" fill="#c4b5fd" x="555" y="170" textAnchor="middle">M3 — Charge</text>
            <text fontFamily="system-ui" fontSize="10" fill="#a78bfa" x="555" y="188" textAnchor="middle">TGBD — conso. totale</text>
            {/* Flèches */}
            <line x1="150" y1="56"  x2="228" y2="165" stroke="#378ADD" strokeWidth="1.5" markerEnd="url(#arr)"/>
            <line x1="150" y1="176" x2="253" y2="176" stroke="#4ade80" strokeWidth="2"   markerEnd="url(#arr)"/>
            <line x1="150" y1="290" x2="228" y2="195" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arr)"/>
            <line x1="375" y1="176" x2="488" y2="176" stroke="#f87171" strokeWidth="2"   markerEnd="url(#arr)"/>
            {/* Labels */}
            <text fontFamily="system-ui" fontSize="10" fill="#60a5fa" x="192" y="108" textAnchor="middle">si M5 insuffisant</text>
            <text fontFamily="system-ui" fontSize="10" fill="#f59e0b" x="192" y="246" textAnchor="middle">secours</text>
            {/* Formule M5 */}
            <rect x="178" y="234" width="152" height="38" rx="6" fill="#14382a" stroke="#3B6D11" strokeWidth="0.5"/>
            <text fontFamily="system-ui" fontSize="11" fontWeight="500" fill="#86efac" x="254" y="249" textAnchor="middle">M5 = M2 − M1</text>
            <text fontFamily="system-ui" fontSize="10" fill="#4ade80" x="254" y="264" textAnchor="middle">si pas de capteur direct</text>
            {/* Formule taux */}
            <rect x="415" y="234" width="208" height="38" rx="6" fill="#1e1b4b" stroke="#534AB7" strokeWidth="0.5"/>
            <text fontFamily="system-ui" fontSize="11" fontWeight="500" fill="#c4b5fd" x="519" y="249" textAnchor="middle">Taux couverture = M5/M3 × 100</text>
            <text fontFamily="system-ui" fontSize="10" fill="#a78bfa" x="519" y="264" textAnchor="middle">% conso couverte par le solaire</text>
            {/* Triphasé */}
            <rect x="20" y="334" width="600" height="18" rx="5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
            <text fontFamily="system-ui" fontSize="10" fill="#64748b" x="320" y="343" textAnchor="middle" dominantBaseline="central">
              Installation triphasée — phases A, B, C · adaptable monophasé
            </text>
          </svg>
        </div>
      </div>

      {/* Formules bilan */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Formules bilan énergétique</div>
          {[
            { badge: 'M3', color: 'bg-violet-900/60 text-violet-300', label: 'Charge réelle', formula: 'M1 (réseau acheté) + M5 (production PV)' },
            { badge: 'M5', color: 'bg-green-900/60 text-green-300',   label: 'PV déduit',    formula: 'M2 − M1 (si pas de capteur direct)' },
            { badge: '%',  color: 'bg-amber-900/60 text-amber-300',   label: 'Taux couverture', formula: '(M5 / M3) × 100' },
            { badge: '₣',  color: 'bg-blue-900/60 text-blue-300',     label: 'Économie réelle', formula: 'M5 (kWh) × Coût unitaire réel (FCFA/kWh)' },
          ].map(({ badge, color, label, formula }) => (
            <div key={label} className="flex items-start gap-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>{badge}</span>
              <div>
                <span className="text-xs font-medium text-slate-300">{label} : </span>
                <span className="text-xs text-slate-400">{formula}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Points de mesure</div>
          {[
            { code: 'M1', color: 'bg-blue-900/60 text-blue-300',   type: 'Réseau public',     desc: 'Senelec · tarif K2 MT · HP/HC' },
            { code: 'M2', color: 'bg-red-900/60 text-red-300',     type: 'Sélecteur / ATS',   desc: 'Convergence des sources' },
            { code: 'M3', color: 'bg-violet-900/60 text-violet-300', type: 'Charge (TGBD)',    desc: 'Consommation totale réelle' },
            { code: 'M4', color: 'bg-amber-900/60 text-amber-300', type: 'Groupe électrogène', desc: 'Source de secours' },
            { code: 'M5', color: 'bg-green-900/60 text-green-300', type: 'PV + Batterie',      desc: 'Production solaire prioritaire' },
          ].map(({ code, color, type, desc }) => (
            <div key={code} className="flex items-start gap-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>{code}</span>
              <div>
                <span className="text-xs font-medium text-slate-300">{type} — </span>
                <span className="text-xs text-slate-400">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!siteId && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          Configurez un site dans l'onglet <strong>Sources</strong> pour activer les analyses en temps réel.
        </div>
      )}
    </div>
  );
}
