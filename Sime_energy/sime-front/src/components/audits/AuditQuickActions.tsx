import { useNavigate } from 'react-router-dom';
import { Package, FileText, BarChart3, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AuditQuickActionsProps {
  onCreateAction: () => void;
  auditId: string;
}

interface ModuleItem {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  subtitle: string;
  onClick: () => void;
}

export function AuditQuickActions({ onCreateAction, auditId }: AuditQuickActionsProps) {
  const navigate = useNavigate();

  const modules: ModuleItem[] = [
    {
      icon: <FileText className="w-4 h-4 text-blue-400" />,
      iconBg: 'bg-blue-500/15',
      label: 'Facturation',
      subtitle: 'Factures SENELEC',
      onClick: () => navigate(`/facturation?auditId=${auditId}`),
    },
    {
      icon: <Package className="w-4 h-4 text-violet-400" />,
      iconBg: 'bg-violet-500/15',
      label: 'Inventaire',
      subtitle: 'Équipements & pièces',
      onClick: () => navigate(`/inventaire?auditId=${auditId}`),
    },
    {
      icon: <BarChart3 className="w-4 h-4 text-emerald-400" />,
      iconBg: 'bg-emerald-500/15',
      label: 'Rapport',
      subtitle: 'Synthèse & analyse',
      onClick: () => navigate(`/rapport?auditId=${auditId}`),
    },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        Modules du projet
      </p>

      <div className="space-y-1.5">
        {modules.map((mod) => (
          <button
            key={mod.label}
            onClick={mod.onClick}
            className={cn(
              'flex items-center gap-3 w-full p-3 rounded-lg',
              'bg-[#151825] border border-slate-700/30',
              'hover:border-slate-600/60 hover:bg-slate-800/40',
              'cursor-pointer transition-all group text-left'
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                mod.iconBg
              )}
            >
              {mod.icon}
            </div>

            {/* Labels */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 leading-none mb-0.5">
                {mod.label}
              </p>
              <p className="text-xs text-slate-500">{mod.subtitle}</p>
            </div>

            {/* Chevron */}
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
          </button>
        ))}
      </div>

      {/* Secondary action */}
      <div className="mt-3 pt-3 border-t border-slate-700/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateAction}
          className="w-full h-7 text-xs text-slate-500 hover:text-slate-300 gap-1.5 justify-start"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter action terrain
        </Button>
      </div>
    </div>
  );
}
