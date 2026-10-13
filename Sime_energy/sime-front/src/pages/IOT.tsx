import {
  Zap, BarChart2,
  Database, Eraser, FolderOpen, LayoutDashboard, Settings, ZapOff,
} from 'lucide-react';
import { IOTProvider, useIOT } from '@/components/iot/IOTContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardTab }      from '@/components/iot/DashboardTab';
import { SourcesTab }        from '@/components/iot/SourcesTab';
import { FichiersTab }       from '@/components/iot/FichiersTab';
import { AnalyseTab }        from '@/components/iot/AnalyseTab';
import { NettoyageTab }      from '@/components/iot/NettoyageTab';
import { ParametresTab }     from '@/components/iot/ParametresTab';
import { CoupuresTab }       from '@/components/iot/CoupuresTab';
import { Badge }             from '@/components/ui/badge';
import { TablePrefsProvider, TableDisplayToggle, useTablePrefs } from '@/components/iot/tablePrefs';

// ---- Définition des onglets ----
// disabled : onglet en pause — grisé, non cliquable, jamais affiché (réactiver = retirer le drapeau)
const TABS: readonly { id: string; label: string; icon: typeof Zap; description: string; disabled?: boolean }[] = [
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard, description: 'Vue temps réel multi-sites' },
  { id: 'sources',    label: 'Sources',     icon: Database,        description: 'Rôles électriques par site' },
  { id: 'fichiers',   label: 'Fichiers',    icon: FolderOpen,      description: 'Import & bibliothèque' },
  { id: 'nettoyage',  label: 'Nettoyage',   icon: Eraser,          description: 'Tri · filtre · édition' },
  { id: 'tcd',        label: 'Analyse',     icon: BarChart2,       description: 'Courbe · TCD · Heatmap · Distribution' },
  { id: 'coupures',   label: 'Coupures',    icon: ZapOff,          description: 'Causes · énergie non distribuée', disabled: true },
  { id: 'parametres', label: 'Paramètres',  icon: Settings,        description: 'Comptes Shelly Cloud' },
];

type TabId = 'dashboard' | 'sources' | 'fichiers' | 'nettoyage' | 'tcd' | 'coupures' | 'parametres';

const DISABLED_TABS = new Set(TABS.filter(t => t.disabled).map(t => t.id));

// ---- Page intérieure (accès au contexte) ----
function IOTInner() {
  const { state, setActiveTab } = useIOT();
  const { activeTab, shellyRows, files } = state;
  const { fit, density } = useTablePrefs();

  // Un onglet en pause mémorisé dans le navigateur renvoie au Dashboard
  const savedTab = (activeTab as TabId) ?? 'dashboard';
  const tabId: TabId = DISABLED_TABS.has(savedTab) ? 'dashboard' : savedTab;

  // Les sources vivent en base (shelly_device_roles) : pas de badge local.
  const badges: Partial<Record<TabId, number>> = {
    fichiers: files.length > 0 ? files.length : undefined,
  };

  // Onglets qui affichent des tableaux larges : le sélecteur Ajuster/Défiler y est utile
  const hasTables = tabId === 'fichiers' || tabId === 'nettoyage' || tabId === 'tcd';

  return (
    <div className="space-y-6" data-table-fit={fit} data-table-density={density}>
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center">
              <Zap className="h-4 w-4 text-blue-400" />
            </div>
            Module IOT
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Sources · Upload · Nettoyage · Courbe de charge · TCD
          </p>
        </div>

        {/* Indicateurs rapides */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          {shellyRows.length > 0 && (
            <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-center">
              <p className="text-green-400 font-bold text-sm">{shellyRows.length}</p>
              <p>jours</p>
            </div>
          )}
          {files.length > 0 && (
            <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-center">
              <p className="text-yellow-400 font-bold text-sm">{files.length}</p>
              <p>fichier(s)</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation onglets — scrollable horizontal sur mobile — + affichage des tableaux */}
      <div className="flex flex-wrap items-center gap-3">
      <div className="overflow-x-auto flex-1 min-w-0">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-max min-w-full sm:w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const badge = badges[tab.id as TabId];
            const isActive = tabId === tab.id;
            if (tab.disabled) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Module en pause — bientôt disponible"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium relative whitespace-nowrap text-slate-600 opacity-60 cursor-not-allowed"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{tab.label}</span>
                  <Badge className="ml-1 h-5 text-[10px] px-1.5 bg-slate-700/60 text-slate-400 border-0">En pause</Badge>
                </button>
              );
            }
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative whitespace-nowrap
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{tab.label}</span>
                {badge !== undefined && (
                  <Badge
                    className={`ml-1 h-5 min-w-5 text-xs px-1 ${isActive ? 'bg-white/20 text-white' : 'bg-blue-600/50 text-blue-300'} border-0`}
                  >
                    {badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {hasTables && <TableDisplayToggle />}
      </div>

      {/* Contenu onglet */}
      <div className="min-h-[400px]">
        {tabId === 'dashboard'  && <DashboardTab />}
        {tabId === 'sources'    && <SourcesTab />}
        {tabId === 'fichiers'   && <FichiersTab />}
        {tabId === 'nettoyage'  && <NettoyageTab />}
        {tabId === 'tcd'        && <AnalyseTab />}
        {tabId === 'coupures'   && <CoupuresTab />}
        {tabId === 'parametres' && <ParametresTab />}
      </div>
    </div>
  );
}

// ---- Export page ----
export default function IOT() {
  return (
    <IOTProvider>
      <TablePrefsProvider>
        <ErrorBoundary title="Erreur Module IOT">
          <IOTInner />
        </ErrorBoundary>
      </TablePrefsProvider>
    </IOTProvider>
  );
}
