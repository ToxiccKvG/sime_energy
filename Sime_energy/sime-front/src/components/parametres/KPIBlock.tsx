import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

interface KPIMetric {
  label:   string
  value:   string | number
  unit?:   string
  alert?:  boolean   // rouge si vrai
  good?:   boolean   // vert si vrai
  missing?: boolean  // grisé "donnée manquante"
  tooltip?: string
}

interface KPIBlockProps {
  title:   string
  icon?:   React.ReactNode
  metrics: KPIMetric[]
  accent?: 'blue' | 'amber' | 'emerald' | 'red' | 'violet'
  className?: string
}

const ACCENT = {
  blue:    { border: 'border-blue-500/20',    title: 'text-blue-300',    dot: 'bg-blue-400'    },
  amber:   { border: 'border-amber-500/20',   title: 'text-amber-300',   dot: 'bg-amber-400'   },
  emerald: { border: 'border-emerald-500/20', title: 'text-emerald-300', dot: 'bg-emerald-400' },
  red:     { border: 'border-red-500/20',     title: 'text-red-300',     dot: 'bg-red-400'     },
  violet:  { border: 'border-violet-500/20',  title: 'text-violet-300',  dot: 'bg-violet-400'  },
}

function MetricRow({ m }: { m: KPIMetric }) {
  let valCls = 'text-slate-100 font-semibold tabular-nums'
  if (m.missing) valCls = 'text-slate-600 italic text-sm font-normal'
  else if (m.alert) valCls = 'text-red-400 font-semibold tabular-nums'
  else if (m.good)  valCls = 'text-emerald-400 font-semibold tabular-nums'

  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-slate-400 leading-tight">{m.label}</span>
      <span className={cn('text-sm text-right shrink-0', valCls)}>
        {m.missing
          ? 'donnée manquante'
          : typeof m.value === 'number'
            ? formatNumber(m.value, 0)
            : m.value}
        {!m.missing && m.unit && (
          <span className="text-xs text-slate-500 ml-1">{m.unit}</span>
        )}
      </span>
    </div>
  )
}

export function KPIBlock({ title, icon, metrics, accent = 'blue', className }: KPIBlockProps) {
  const a = ACCENT[accent]
  return (
    <div className={cn(
      'rounded-xl border bg-[#0d1018] p-4',
      a.border,
      className,
    )}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="opacity-60">{icon}</span>}
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider', a.title)}>{title}</h4>
      </div>
      <div>
        {metrics.map((m, i) => <MetricRow key={i} m={m} />)}
      </div>
    </div>
  )
}
