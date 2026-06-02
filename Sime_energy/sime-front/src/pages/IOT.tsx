import {
  Zap, BarChart2,
  Database, Eraser, FolderOpen, LayoutDashboard, Settings,
} from 'lucide-react';
import { IOTProvider, useIOT } from '@/components/iot/IOTContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardTab }    from '@/components/iot/DashboardTab';
import { SourcesTab }      from '@/components/iot/SourcesTab';
import { FichiersTab }     from '@/components/iot/FichiersTab';
import { AnalyseTab }      from '@/components/iot/AnalyseTab';
import { NettoyageTab }    from '@/components/iot/NettoyageTab';
import { ParametresTab }   from '@/components/iot/ParametresTab';
import { Badge }           from '@/components/ui/badge';

// ---- Définition des onglets ----
const TABS = [
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard, description: 'Vue temps réel multi-sites' },
  { id: 'sources',    label: 'Sources',     icon: Database,        description: 'Capteurs & sources' },
  { id: 'fichiers',   label: 'Fichiers',    icon: FolderOpen,      description: 'Import & bibliothèque' },
  { id: 'nettoyage',  label: 'Nettoyage',   icon: Eraser,          description: 'Tri · filtre · édition' },
  { id: 'tcd',        label: 'Analyse',     icon: BarChart2,       description: 'Courbe · TCD · Heatmap · Distribution' },
  { id: 'parametres', label: 'Paramètres',  icon: Settings,        description: 'Comptes Shelly Cloud' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---- Page intérieure (accès au contexte) ----
function IOTInner() {
  const { state, setActiveTab } = useIOT();
  const { activeTab, shellyRows, files, sources } = state;

  const tabId = (activeTab as TabId) ?? 'dashboard';

  // Badge Sources = nb sources actives (dynamique, masqué si 0)
  const nbSourcesActives = sources.filter(s => s.actif).length;
  const badges: Partial<Record<TabId, number>> = {
    sources:  nbSourcesActives > 0 ? nbSourcesActives : undefined,
    fichiers: files.length > 0 ? files.length : undefined,
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
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
        <div className="flex gap-3 text-xs text-slate-400">
          {sources.filter(s => s.actif).length > 0 && (
            <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-center">
              <p className="text-blue-400 font-bold text-sm">{sources.filter(s => s.actif).length}</p>
              <p>source(s)</p>
            </div>
          )}
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

      {/* Navigation onglets — scrollable horizontal sur mobile */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-max min-w-full sm:w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const badge = badges[tab.id];
            const isActive = tabId === tab.id;
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

      {/* Contenu onglet */}
      <div className="min-h-[400px]">
        {tabId === 'dashboard'  && <DashboardTab />}
        {tabId === 'sources'    && <SourcesTab />}
        {tabId === 'fichiers'   && <FichiersTab />}
        {tabId === 'nettoyage'  && <NettoyageTab />}
        {tabId === 'tcd'        && <AnalyseTab />}
        {tabId === 'parametres' && <ParametresTab />}
      </div>
    </div>
  );
}

// ---- Export page ----
export default function IOT() {
  return (
    <IOTProvider>
      <ErrorBoundary title="Erreur Module IOT">
        <IOTInner />
      </ErrorBoundary>
    </IOTProvider>
  );
}
