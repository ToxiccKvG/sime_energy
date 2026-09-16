// ============================================================
// IOT MODULE — Onglet Sources
//
// Une source = un rôle électrique (arrivée réseau, PV, groupe, départ…)
// porté par un ou plusieurs appareils d'un site. Tout est lu depuis la
// base (shelly_device_roles + catalogue des appareils) : partagé entre
// utilisateurs et postes, rien en localStorage.
//
// Règle du chantier 2 : une source est un RACCOURCI, jamais un préalable.
// « Analyser » pré-coche les appareils de la source dans l'onglet Analyse ;
// le chargement libre (site / famille / appareil / période) reste
// intact, et les appareils sans rôle restent visibles ici (« Non classés »)
// et extractibles là-bas.
//
// Le rattachement lui-même se fait dans Paramètres → Rôles des appareils.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Battery, Building2, ChevronDown, ChevronUp, Cpu, Fuel, HelpCircle, Info, LineChart,
  Loader2, PlugZap, RefreshCw, Settings2, Sun, Thermometer, ToggleLeft, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIOT } from './IOTContext';
import { fetchDeviceRoles, DEVICE_ROLES, type DeviceRole, type ShellyDeviceRole } from '@/lib/shelly-device-role-service';
import { fetchDisponibles } from '@/lib/iot-supabase-service';

// ---- Vocabulaire des sources (neutre : aucun distributeur, aucun pays) ----

type SourceKey = DeviceRole | 'NON_CLASSE';

interface SourceMeta {
  label: string;
  short: string;
  description: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Fait partie du bilan énergétique (M1..M5, BESS) — mis en avant. */
  bilan: boolean;
}

const SOURCE_META: Record<SourceKey, SourceMeta> = {
  M1_RESEAU:    { label: 'Arrivée réseau',        short: 'M1', description: 'Énergie soutirée au distributeur public (et injectée, le cas échéant).', color: '#3b82f6', icon: Zap,        bilan: true },
  M2_SELECTEUR: { label: 'Sélecteur / inverseur', short: 'M2', description: 'Point de bascule entre le réseau et la production locale.',             color: '#a855f7', icon: ToggleLeft, bilan: true },
  M3_CHARGE:    { label: 'Charge totale',         short: 'M3', description: 'Tout ce que le site consomme, quelle que soit la source.',             color: '#ef4444', icon: PlugZap,    bilan: true },
  M4_GROUPE:    { label: 'Groupe électrogène',    short: 'M4', description: 'Production de secours au carburant.',                                   color: '#f97316', icon: Fuel,       bilan: true },
  M5_PV:        { label: 'Production PV',         short: 'M5', description: 'Énergie produite par les panneaux photovoltaïques.',                    color: '#eab308', icon: Sun,        bilan: true },
  BESS:         { label: 'Batterie de stockage',  short: 'BESS', description: 'Charge et décharge du stockage.',                                     color: '#22c55e', icon: Battery,    bilan: true },
  DEPART:       { label: 'Départs / sous-charges', short: 'Départ', description: 'Circuits ou équipements individuels (clim, prises, éclairage…).',  color: '#64748b', icon: Cpu,        bilan: false },
  AMBIANCE:     { label: "Capteurs d'ambiance",   short: 'Ambiance', description: 'Température, humidité, CO₂, pression…',                          color: '#06b6d4', icon: Thermometer, bilan: false },
  AUTRE:        { label: 'Autres appareils',      short: 'Autre', description: 'Relais, contacts, boutons, détecteurs…',                            color: '#94a3b8', icon: HelpCircle, bilan: false },
  NON_CLASSE:   { label: 'Non classés',           short: '—', description: 'Appareils sans rôle : toujours visibles et extractibles, simplement absents des raccourcis.', color: '#475569', icon: HelpCircle, bilan: false },
};

const SOURCE_ORDER: SourceKey[] = ['M1_RESEAU', 'M2_SELECTEUR', 'M3_CHARGE', 'M4_GROUPE', 'M5_PV', 'BESS', 'DEPART', 'AMBIANCE', 'AUTRE', 'NON_CLASSE'];

// ---- Schémas de raccordement (images public/images/modes/*.png) ----
// Illustrent où se placent les points de mesure M1..M5 selon l'architecture
// du site. Référence visuelle uniquement : aucun calcul n'en dépend.
const SCHEMAS: { code: string; label: string; roles: string; image: string }[] = [
  { code: 'A', label: 'Réseau seul',              roles: 'M1 · M3',           image: '/images/modes/mode-a.png' },
  { code: 'B', label: 'Réseau + PV (hybride)',    roles: 'M1 · M2 · M3 · M5', image: '/images/modes/mode-b.png' },
  { code: 'C', label: 'PV + batterie',            roles: 'M3 · M5 · BESS',    image: '/images/modes/mode-c.png' },
  { code: 'D', label: 'Groupe électrogène seul',  roles: 'M3 · M4',           image: '/images/modes/mode-d.png' },
  { code: 'E', label: 'Réseau + groupe (secours)', roles: 'M1 · M2 · M3 · M4', image: '/images/modes/mode-e.png' },
  { code: 'F', label: 'PV + groupe',              roles: 'M2 · M3 · M4 · M5', image: '/images/modes/mode-f.png' },
];

/** Aperçu plein écran d'un schéma après 400 ms de survol. */
function SchemaPreview({ schema, children }: { schema: (typeof SCHEMAS)[number]; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => { timer.current = setTimeout(() => setShow(true), 400); };
  const leave = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setShow(false); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      {children}
      {show && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[75vw] h-[75vh] flex flex-col">
            <img src={schema.image} alt={`Schéma ${schema.code}`} className="flex-1 w-full object-contain min-h-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="text-center mt-4 shrink-0">
              <p className="text-lg text-slate-800 font-bold">{schema.code} — {schema.label}</p>
              <p className="text-sm text-slate-500">Points de mesure : {schema.roles}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Appareil {
  device_id: string;
  name: string;
  site: string;
  room?: string | null;
  device_family: string;
}

interface SourceGroup {
  key: SourceKey;
  meta: SourceMeta;
  /** Appareils au rôle confirmé (ou sans rôle pour NON_CLASSE). */
  devices: Appareil[];
  /** Appareils au rôle proposé mais non confirmé — jamais mélangés aux confirmés. */
  proposed: Appareil[];
  inverted: Set<string>;
}

interface SiteGroup {
  site: string;
  sources: SourceGroup[];
  total: number;
  unclassified: number;
  proposed: number;
}

function buildSites(appareils: Appareil[], roles: ShellyDeviceRole[]): SiteGroup[] {
  const roleByDevice = new Map(roles.map(r => [r.device_id, r]));
  const bySite = new Map<string, Appareil[]>();
  for (const a of appareils) {
    const key = a.site || 'Sans site';
    const list = bySite.get(key);
    if (list) list.push(a); else bySite.set(key, [a]);
  }

  return Array.from(bySite.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([site, devices]) => {
      const groups = new Map<SourceKey, SourceGroup>();
      const get = (key: SourceKey) => {
        let g = groups.get(key);
        if (!g) { g = { key, meta: SOURCE_META[key], devices: [], proposed: [], inverted: new Set() }; groups.set(key, g); }
        return g;
      };
      let unclassified = 0, proposed = 0;
      for (const d of devices) {
        const r = roleByDevice.get(d.device_id);
        if (!r) { get('NON_CLASSE').devices.push(d); unclassified++; continue; }
        const g = get(r.role);
        if (r.confirme_at) g.devices.push(d); else { g.proposed.push(d); proposed++; }
        if (r.sens_inverse) g.inverted.add(d.device_id);
      }
      const sources = SOURCE_ORDER.map(k => groups.get(k)).filter((g): g is SourceGroup => !!g);
      sources.forEach(g => {
        g.devices.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        g.proposed.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      });
      return { site, sources, total: devices.length, unclassified, proposed };
    });
}

// ============================================================

export function SourcesTab() {
  const { setActiveTab, setAnalysePreset } = useIOT();
  const [roles, setRoles] = useState<ShellyDeviceRole[]>([]);
  const [appareils, setAppareils] = useState<Appareil[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSites, setOpenSites] = useState<Record<string, boolean>>({});
  const [legendOpen, setLegendOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, dispo] = await Promise.all([fetchDeviceRoles(), fetchDisponibles()]);
      setRoles(r);
      setAppareils(dispo.devices.map(d => ({
        device_id: d.device_id, name: d.name, site: d.site, room: d.room, device_family: d.device_family,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const sites = useMemo(() => buildSites(appareils, roles), [appareils, roles]);
  const totals = useMemo(() => ({
    devices: appareils.length,
    classified: roles.filter(r => r.confirme_at).length,
    proposed: roles.filter(r => !r.confirme_at).length,
    unclassified: sites.reduce((s, x) => s + x.unclassified, 0),
  }), [appareils, roles, sites]);

  const isOpen = (site: string) => openSites[site] ?? true;

  const analyser = (site: string, group: SourceGroup) => {
    setAnalysePreset({
      label: `${group.meta.label} — ${site}`,
      site,
      deviceIds: group.devices.map(d => d.device_id),
    });
    setActiveTab('tcd'); // id de l'onglet « Analyse »
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold text-lg">Sources par site</h2>
          <p className="text-slate-400 text-sm mt-0.5 max-w-2xl">
            Une source est un rôle électrique porté par un ou plusieurs appareils, lu depuis la base et partagé
            entre utilisateurs. C'est un raccourci vers l'analyse : le chargement libre par site, famille, appareil et
            période reste toujours disponible dans l'onglet Analyse.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/20 text-slate-300 hover:bg-white/5 h-8 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Actualiser
          </Button>
          <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setActiveTab('parametres')}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Rattacher des appareils
          </Button>
        </div>
      </div>

      {/* Compteurs */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Appareils" value={totals.devices} />
          <Stat label="Rattachés (confirmés)" value={totals.classified} tone="text-emerald-400" />
          <Stat label="À confirmer" value={totals.proposed} tone={totals.proposed ? 'text-amber-400' : 'text-slate-300'} />
          <Stat label="Non classés" value={totals.unclassified} tone={totals.unclassified ? 'text-slate-300' : 'text-emerald-400'} />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
      )}
      {loading && (
        <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des rattachements…</p>
      )}

      {/* Sites */}
      {!loading && sites.map(s => (
        <div key={s.site} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
            onClick={() => setOpenSites(prev => ({ ...prev, [s.site]: !isOpen(s.site) }))}>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              <span className="text-white font-medium">{s.site}</span>
              <span className="text-slate-500 text-xs">{s.total} appareil{s.total > 1 ? 's' : ''}</span>
              {s.proposed > 0 && <Badge className="bg-amber-500/15 text-amber-300 border-0 text-[11px]">{s.proposed} à confirmer</Badge>}
              {s.unclassified > 0 && <Badge className="bg-white/10 text-slate-400 border-0 text-[11px]">{s.unclassified} non classé{s.unclassified > 1 ? 's' : ''}</Badge>}
            </div>
            {isOpen(s.site) ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {isOpen(s.site) && (
            <div className="border-t border-white/10 divide-y divide-white/5">
              {s.sources.map(g => {
                const Icon = g.meta.icon;
                const canAnalyse = g.devices.length > 0;
                return (
                  <div key={g.key} className="px-4 py-3 flex flex-wrap items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: g.meta.color + '22' }}>
                      <Icon className="h-4 w-4" style={{ color: g.meta.color }} />
                    </div>
                    <div className="flex-1 min-w-[14rem]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{g.meta.label}</span>
                        {g.meta.bilan && <span className="text-[10px] uppercase tracking-wide text-slate-500">{g.meta.short}</span>}
                        <span className="text-slate-500 text-xs">
                          {g.devices.length} appareil{g.devices.length > 1 ? 's' : ''}
                          {g.proposed.length > 0 && <> · <span className="text-amber-400">{g.proposed.length} à confirmer</span></>}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.devices.map(d => (
                          <span key={d.device_id} className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300" title={`${d.device_id} · ${d.device_family}${d.room ? ` · ${d.room}` : ''}`}>
                            {d.name}
                            {g.inverted.has(d.device_id) && <span className="ml-1 text-amber-400" title="TC monté à l'envers : soutirage et injection permutés">⇄</span>}
                          </span>
                        ))}
                        {g.proposed.map(d => (
                          <span key={d.device_id} className="text-xs px-2 py-0.5 rounded-md border border-dashed border-amber-500/40 text-amber-300/80" title="Rôle proposé automatiquement, non confirmé — non utilisé par le raccourci Analyser">
                            {d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    {g.key !== 'NON_CLASSE' ? (
                      <Button variant="outline" size="sm" disabled={!canAnalyse}
                        className="h-8 text-xs border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title={canAnalyse ? 'Ouvrir Analyse avec ces appareils pré-cochés (modifiable)' : 'Aucun appareil confirmé pour cette source'}
                        onClick={() => analyser(s.site, g)}>
                        <LineChart className="h-3.5 w-3.5 mr-1.5" /> Analyser
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-400 hover:text-white" onClick={() => setActiveTab('parametres')}>
                        <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Classer
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {!loading && !error && sites.length === 0 && (
        <p className="text-sm text-slate-400">Aucun appareil dans le catalogue. Vérifiez les comptes Shelly dans Paramètres.</p>
      )}

      {/* Légende */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left" onClick={() => setLegendOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-400" />
            <span className="text-slate-300 font-medium text-sm">Légende — rôles et badges</span>
          </div>
          {legendOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {legendOpen && (
          <div className="border-t border-white/10 p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {SOURCE_ORDER.map(k => {
              const m = SOURCE_META[k]; const Icon = m.icon;
              return (
                <div key={k} className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: m.color }} />
                  <div>
                    <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
                    {k !== 'NON_CLASSE' && <span className="text-slate-600"> · {DEVICE_ROLES.find(r => r.value === k)?.label}</span>}
                    <p className="text-slate-500">{m.description}</p>
                  </div>
                </div>
              );
            })}
            <div className="md:col-span-2 border-t border-white/10 pt-3 mt-1">
              <p className="text-slate-300 font-medium mb-2">Schémas de raccordement <span className="text-slate-500 font-normal">— survoler pour agrandir</span></p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SCHEMAS.map(s => (
                  <SchemaPreview key={s.code} schema={s}>
                    <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white/5 cursor-help">
                      <span className="w-6 h-6 rounded bg-blue-500/15 text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">{s.code}</span>
                      <div className="min-w-0">
                        <p className="text-slate-300 truncate">{s.label}</p>
                        <p className="text-slate-600 text-[10px]">{s.roles}</p>
                      </div>
                    </div>
                  </SchemaPreview>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 border-t border-white/10 pt-2 mt-1 space-y-1 text-slate-400">
              <p><span className="inline-block px-1.5 rounded border border-dashed border-amber-500/40 text-amber-300/80">nom</span> rôle proposé automatiquement, à confirmer dans Paramètres — ignoré par le bouton Analyser.</p>
              <p><span className="text-amber-400">⇄</span> transformateur de courant monté à l'envers : soutirage et injection sont permutés dans les calculs.</p>
              <p>Le rôle M1 désigne l'arrivée du distributeur public, quel qu'il soit (SENELEC, SONABEL…).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-white' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2">
      <p className={`text-lg font-semibold leading-tight ${tone}`}>{value}</p>
      <p className="text-slate-500 text-xs">{label}</p>
    </div>
  );
}
