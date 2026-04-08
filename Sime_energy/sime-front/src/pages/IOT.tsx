import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { Activity, Cpu, Zap, Upload, CalendarDays, TrendingUp, Table2, BarChart3, FlaskConical, Database, Download } from 'lucide-react';

import { ArchitectureTab }  from '@/components/iot/ArchitectureTab';
import { SourcesTab }       from '@/components/iot/SourcesTab';
import { TarifsTab }        from '@/components/iot/TarifsTab';
import { UploadTab }        from '@/components/iot/UploadTab';
import { CalendrierTab }    from '@/components/iot/CalendrierTab';
import { CourbeChargeTab }  from '@/components/iot/CourbeChargeTab';
import { TCDTab }           from '@/components/iot/TCDTab';
import { BilanTab }         from '@/components/iot/BilanTab';
import { SimulationsTab }   from '@/components/iot/SimulationsTab';
import { SupabaseTab }      from '@/components/iot/SupabaseTab';
import { ExportsTab }       from '@/components/iot/ExportsTab';

// ─── Définition des onglets ────────────────────────────────────────────────────

const TABS = [
  { id: 'arch',      label: 'Architecture', sub: 'Schéma',        icon: Cpu,          color: '#534AB7', bg: '#EEEDFE' },
  { id: 'sources',   label: 'Sources',      sub: 'M1–M5',          icon: Activity,     color: '#185FA5', bg: '#E6F1FB' },
  { id: 'tarifs',    label: 'Tarifs',       sub: 'HP/HC · K2',     icon: Zap,          color: '#A32D2D', bg: '#FCEBEB' },
  { id: 'upload',    label: 'Import',       sub: 'Données',        icon: Upload,       color: '#0F6E56', bg: '#E1F5EE' },
  { id: 'cal',       label: 'Calendrier',   sub: 'Fériés',         icon: CalendarDays, color: '#5F5E5A', bg: '#F1EFE8' },
  { id: 'courbe',    label: 'Courbe',       sub: 'Charge',         icon: TrendingUp,   color: '#854F0B', bg: '#FAEEDA' },
  { id: 'tcd',       label: 'TCD',          sub: 'Analyse',        icon: Table2,       color: '#712B13', bg: '#FAECE7' },
  { id: 'bilan',     label: 'Bilan M1–M5',  sub: 'Financier',      icon: BarChart3,    color: '#72243E', bg: '#FBEAF0' },
  { id: 'simu',      label: 'Simulations',  sub: 'Optimisation',   icon: FlaskConical, color: '#27500A', bg: '#EAF3DE' },
  { id: 'supabase',  label: 'Supabase',     sub: 'Données',        icon: Database,     color: '#085041', bg: '#E1F5EE' },
  { id: 'exports',   label: 'Exports',      sub: 'Excel · PDF',    icon: Download,     color: '#444441', bg: '#F1EFE8' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Composant principal ───────────────────────────────────────────────────────

export default function IOT() {
  const { user }         = useAuth();
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState<TabId>('arch');
  const [siteId, setSiteId]       = useState<string | null>(null);

  const sharedProps = {
    organizationId: organization?.id ?? '',
    userId:         user?.id ?? '',
    siteId,
    onSiteChange:   setSiteId,
  };

  return (
    <div className="space-y-4">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Module IoT</h1>
        <p className="mt-1 text-sm text-slate-400">
          Analyse énergétique temps réel · Shelly 3EM · M1–M5 · Senelec HP/HC
        </p>
      </div>

      {/* Navigation onglets */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab, i) => {
          const Icon    = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-center transition-all duration-150 hover:opacity-80 min-w-[76px]"
              style={{
                background:   isActive ? tab.bg : 'rgba(255,255,255,0.04)',
                borderColor:  isActive ? tab.color : 'rgba(255,255,255,0.1)',
                boxShadow:    isActive ? `0 0 0 2px ${tab.color}` : 'none',
                color:        isActive ? tab.color : '#94a3b8',
              }}
            >
              {/* Numéro étape */}
              <span
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[9px] font-semibold leading-4"
                style={{ background: tab.color, color: '#fff' }}
              >
                {i + 1}
              </span>
              <Icon size={14} />
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
              <span className="text-[9px] opacity-70 leading-none">{tab.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Contenu des onglets */}
      <div>
        {activeTab === 'arch'     && <ArchitectureTab  {...sharedProps} />}
        {activeTab === 'sources'  && <SourcesTab       {...sharedProps} />}
        {activeTab === 'tarifs'   && <TarifsTab        {...sharedProps} />}
        {activeTab === 'upload'   && <UploadTab        {...sharedProps} />}
        {activeTab === 'cal'      && <CalendrierTab    {...sharedProps} />}
        {activeTab === 'courbe'   && <CourbeChargeTab  {...sharedProps} />}
        {activeTab === 'tcd'      && <TCDTab           {...sharedProps} />}
        {activeTab === 'bilan'    && <BilanTab         {...sharedProps} />}
        {activeTab === 'simu'     && <SimulationsTab   {...sharedProps} />}
        {activeTab === 'supabase' && <SupabaseTab      {...sharedProps} />}
        {activeTab === 'exports'  && <ExportsTab       {...sharedProps} />}
      </div>

    </div>
  );
}
