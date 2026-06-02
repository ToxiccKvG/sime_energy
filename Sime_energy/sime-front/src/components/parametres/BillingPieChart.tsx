import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface PieSegment {
  name:       string
  value:      number    // pourcentage 0–100
  color:      string
  fcfa?:      number    // montant absolu FCFA
  estimated?: boolean   // calculé / reconstruit (pas extrait de l'OCR)
  residual?:  boolean   // résidu non identifié
  hidden?:    boolean   // valeur = 0 : ne pas afficher
}

interface BillingPieChartProps {
  segments: PieSegment[]
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const seg: PieSegment = payload[0].payload
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f111a] px-3 py-2.5 text-xs shadow-xl min-w-[160px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
        <p className="text-slate-200 font-semibold">{seg.name}</p>
      </div>
      <p className="text-slate-100 font-bold tabular-nums text-sm">
        {formatNumber(seg.value, 1)}<span className="text-slate-400 text-xs font-normal ml-0.5">%</span>
      </p>
      {seg.fcfa != null && seg.fcfa > 0 && (
        <p className="text-slate-500 tabular-nums mt-0.5">
          {formatNumber(seg.fcfa, 0)} <span className="text-slate-600">FCFA</span>
        </p>
      )}
      {seg.estimated && (
        <p className="text-amber-500/80 text-[10px] mt-1">valeur calculée / estimée</p>
      )}
      {seg.residual && (
        <p className="text-slate-500 text-[10px] mt-1 leading-relaxed">
          postes non identifiés par l'OCR (TVA, TCO, redevance…)
        </p>
      )}
    </div>
  )
}

export function BillingPieChart({ segments }: BillingPieChartProps) {
  const visible = segments.filter(s => s.value > 0.05 && !s.hidden)

  if (!visible.length) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-600">
        Sélectionnez une facture pour voir la répartition
      </div>
    )
  }

  // Centre label : total identifié vs résidu
  const residuPct = segments.find(s => s.residual)?.value ?? 0
  const identifiePct = Math.round(100 - residuPct)

  return (
    <div className="space-y-3">
      {/* Donut */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={visible}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {visible.map((seg, i) => (
                <Cell
                  key={i}
                  fill={seg.color}
                  opacity={seg.estimated || seg.residual ? 0.55 : 1}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold tabular-nums text-slate-100">{identifiePct}%</span>
          <span className="text-[10px] text-slate-500 leading-tight text-center">identifié<br/>par OCR</span>
        </div>
      </div>

      {/* Légende personnalisée */}
      <div className="space-y-1.5 px-1">
        {visible.map((seg, i) => (
          <div key={i} className={cn(
            'flex items-center justify-between gap-2 px-2 py-1 rounded-md transition-colors',
            seg.residual ? 'bg-white/[0.015]' : 'hover:bg-white/[0.03]',
          )}>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{
                  background: seg.color,
                  opacity: seg.estimated || seg.residual ? 0.6 : 1,
                  border: seg.residual ? '1px dashed rgba(255,255,255,0.2)' : undefined,
                }}
              />
              <span className={cn(
                'text-xs truncate',
                seg.residual ? 'text-slate-600 italic' : 'text-slate-400',
              )}>
                {seg.name}
              </span>
              {seg.estimated && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-500/80 font-mono shrink-0">
                  calc.
                </span>
              )}
              {seg.residual && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700/50 text-slate-500 font-mono shrink-0">
                  ?
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {seg.fcfa != null && seg.fcfa > 0 && (
                <span className="text-[10px] text-slate-600 tabular-nums hidden sm:block">
                  {formatNumber(seg.fcfa, 0)} F
                </span>
              )}
              <span className={cn(
                'text-xs font-semibold tabular-nums w-12 text-right',
                seg.residual ? 'text-slate-600' : 'text-slate-200',
              )}>
                {formatNumber(seg.value, 1)} %
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
