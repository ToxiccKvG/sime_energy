import {
  Upload, Zap, BarChart2, Settings2,
  Database, Eraser,
} from 'lucide-react';
import { IOTProvider, useIOT } from '@/components/iot/IOTContext';
import { SourcesTab }      from '@/components/iot/SourcesTab';
import { UploadTab }       from '@/components/iot/UploadTab';
import { ProfilChargeTab } from '@/components/iot/ProfilChargeTab';
import { AnalyseTab }      from '@/components/iot/AnalyseTab';
import { NettoyageTab }    from '@/components/iot/NettoyageTab';
import { Badge }           from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label }           from '@/components/ui/label';
import { Input }           from '@/components/ui/input';
import type { CategorieTarifaire } from '@/components/iot/shared';
import { useIOT as useIOTCtx }     from '@/components/iot/IOTContext';

// ---- Définition des onglets ----
const TABS = [
  { id: 'sources',     label: 'Sources',         icon: Database,     description: 'Capteurs & sources' },
  { id: 'upload',      label: 'Upload',           icon: Upload,       description: 'CSV / XLSX' },
  { id: 'nettoyage',   label: 'Nettoyage',        icon: Eraser,       description: 'Tri · filtre · édition' },
  { id: 'profil',      label: 'Courbe de charge', icon: Zap,          description: 'Multi-sources' },
  { id: 'tcd',         label: 'TCD',              icon: BarChart2,    description: 'Tableaux croisés' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---- Panneau paramètres globaux ----
function ParamsTarifPanel() {
  const { state, updateParamsTarif, updateDonneesTechniques } = useIOTCtx();
  const { paramsTarif, donneesTechniques } = state;

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-slate-400" />
        <h4 className="text-white font-medium text-sm">Paramètres globaux</h4>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Type tarif</Label>
          <Select
            value={paramsTarif.typeTarif}
            onValueChange={(v) => updateParamsTarif({ typeTarif: v as 'MT' | 'BT' })}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              <SelectItem value="MT">MT — Moyenne Tension</SelectItem>
              <SelectItem value="BT">BT — Basse Tension</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Tarif K1/HHP (FCFA/kWh)</Label>
          <Input
            type="number"
            value={paramsTarif.tarifK1}
            onChange={(e) => updateParamsTarif({ tarifK1: parseFloat(e.target.value) || 0 })}
            className="bg-white/5 border-white/20 text-white text-sm h-8"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Tarif K2/HP (FCFA/kWh)</Label>
          <Input
            type="number"
            value={paramsTarif.tarifK2}
            onChange={(e) => updateParamsTarif({ tarifK2: parseFloat(e.target.value) || 0 })}
            className="bg-white/5 border-white/20 text-white text-sm h-8"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs mb-1 block">Catégorie facturation</Label>
          <Select
            value={donneesTechniques.categorie}
            onValueChange={(v) => updateDonneesTechniques({ categorie: v as CategorieTarifaire })}
          >
            <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-white/20">
              {(['DPP','DMP','PPP','PMP','DGP','PGP','TCU','TG','TLU','TG_HT','TS'] as CategorieTarifaire[]).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ---- Page intérieure (accès au contexte) ----
function IOTInner() {
  const { state, setActiveTab } = useIOT();
  const { activeTab, shellyRows, files, sources } = state;

  const tabId = (activeTab as TabId) ?? 'sources';

  const badges: Partial<Record<TabId, number>> = {
    sources:   sources.length > 0 ? sources.length : undefined,
    upload:    files.length > 0 ? files.length : undefined,
    nettoyage: shellyRows.length > 0 ? shellyRows.length : undefined,
    profil:    shellyRows.length > 0 ? shellyRows.length : undefined,
  };

  // Onglets qui n'affichent pas le panneau paramètres
  const hideParams: TabId[] = ['sources', 'upload', 'nettoyage'];

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

      {/* Paramètres globaux (compact) — hors onglets non concernés */}
      {!hideParams.includes(tabId) && <ParamsTarifPanel />}

      {/* Contenu onglet */}
      <div className="min-h-[400px]">
        {tabId === 'sources'     && <SourcesTab />}
        {tabId === 'upload'      && <UploadTab />}
        {tabId === 'nettoyage'   && <NettoyageTab />}
        {tabId === 'profil'      && <ProfilChargeTab />}
        {tabId === 'tcd'         && <AnalyseTab />}
      </div>
    </div>
  );
}

// ---- Export page ----
export default function IOT() {
  return (
    <IOTProvider>
      <IOTInner />
    </IOTProvider>
  );
}
