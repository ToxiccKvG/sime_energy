import { Audit } from '@/types/audit';
import { ArrowLeft, Calendar, User, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditHeaderProps {
  audit: Audit;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '99, 179, 237';
}

const statusConfig = {
  planned: {
    label: 'Planifié',
    className: 'bg-slate-700/60 text-slate-300 border border-slate-600/50',
  },
  in_progress: {
    label: 'En cours',
    className: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
  },
  completed: {
    label: 'Terminé',
    className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
};

export function AuditHeader({ audit }: AuditHeaderProps) {
  const navigate = useNavigate();
  const status = statusConfig[audit.status];
  const rgb = hexToRgb(audit.color);

  return (
    <div
      className="relative overflow-hidden bg-[#0f111a] border border-slate-700/50 rounded-xl"
      style={{ boxShadow: `0 0 80px rgba(${rgb}, 0.07), 0 1px 3px rgba(0,0,0,0.4)` }}
    >
      {/* Ambient color bleed — left radial spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 55% 100% at 0% 55%, rgba(${rgb}, 0.09) 0%, transparent 65%)`,
        }}
      />

      {/* Left accent strip */}
      <div
        className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full"
        style={{
          backgroundColor: audit.color,
          boxShadow: `0 0 14px rgba(${rgb}, 0.7), 0 0 28px rgba(${rgb}, 0.3)`,
        }}
      />

      <div className="relative px-4 py-4 pl-6 md:px-8 md:py-5 md:pl-10 space-y-5">
        {/* Top row: back link + actions */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/audits')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux projets
          </button>

        </div>

        {/* Main content: title left, big % right */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Status + title */}
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
                  status.className
                )}
              >
                {status.label}
              </span>
            </div>
            <h1 className="text-2xl md:text-[2rem] font-bold text-white leading-tight tracking-tight">
              {audit.name}
            </h1>

            {/* Metadata row with icons */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {audit.generalInfo?.nomEtablissement && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {audit.generalInfo.nomEtablissement}
                </span>
              )}
              {audit.generalInfo?.secteur && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                  <span>{audit.generalInfo.secteur}</span>
                </>
              )}
              {audit.startDate && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {format(new Date(audit.startDate), 'dd MMM yyyy', { locale: fr })}
                  </span>
                </>
              )}
              {audit.responsable && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                  <span className="flex items-center gap-1.5">
                    <User className="w-3 h-3 shrink-0" />
                    {audit.responsable}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Completion scorecard */}
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5">
              Avancement
            </p>
            <p
              className="text-5xl font-mono font-bold leading-none tabular-nums"
              style={{ color: audit.color, textShadow: `0 0 30px rgba(${rgb}, 0.4)` }}
            >
              {audit.completionPercentage}
              <span className="text-2xl ml-0.5 opacity-70">%</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5 pt-1">
          <div className="relative h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${audit.completionPercentage}%`,
                backgroundColor: audit.color,
                boxShadow: `0 0 10px rgba(${rgb}, 0.7)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
