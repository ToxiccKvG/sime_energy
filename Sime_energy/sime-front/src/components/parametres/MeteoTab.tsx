/**
 * MeteoTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux modes :
 *   Configuration  — localité + températures mensuelles de référence + CoefC/G
 *   Exploration    — date/plage précise + variables sélectionnables + chart + table
 *
 * Source : Open-Meteo (geocoding + archive), fetch() direct depuis le navigateur.
 * Stockage : user_metadata.energy_settings.meteo_settings
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  BarChart, Bar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Search, MapPin, RefreshCw, Loader2, Thermometer,
  Wind, CheckCircle2, AlertCircle, Info, Calendar,
  BarChart2, Settings2, Database, CloudSun, Droplets,
  Sun, CloudRain,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  searchLocations,
  fetchMonthlyTemps,
  fetchWeatherRange,
  computeStats,
  computeDJU,
  DAILY_VARIABLES,
  HOURLY_VARIABLES,
  DEFAULT_METEO_SETTINGS,
  type GeoLocation,
  type MeteoSettings,
  type WeatherRecord,
  type WeatherResult,
  type VariableMeta,
} from '@/services/meteo-service';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const inputCls = 'bg-slate-800/50 border-slate-700 text-slate-100 h-9 text-sm rounded-lg focus-visible:ring-violet-500/40';

function tempColor(t: number) {
  if (t < 20) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (t < 25) return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';
  if (t < 30) return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  if (t < 35) return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
}

function today() {
  return new Date().toISOString().split('T')[0];
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// Days difference between two YYYY-MM-DD strings
function daysDiff(a: string, b: string) {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MeteoTab() {
  const { user } = useAuth();
  const energyMeta = (user?.user_metadata?.energy_settings ?? {}) as Record<string, any>;
  const saved = (energyMeta.meteo_settings ?? null) as MeteoSettings | null;

  const [settings, setSettings] = useState<MeteoSettings>(saved ?? DEFAULT_METEO_SETTINGS);
  const [saving, setSaving]     = useState(false);
  const [activeView, setActiveView] = useState<'config' | 'explore'>('config');

  // ── Location search ──
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<GeoLocation[]>([]);
  const [searching, setSearching]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);

  // ── Config fetch status ──
  const [fetchingMonthly, setFetchingMonthly] = useState(false);
  const [monthlyOk, setMonthlyOk]             = useState<boolean | null>(null);

  // ── Exploration state ──
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate,   setEndDate]   = useState(daysAgo(6)); // archive ~5 days lag
  const [selectedVarKeys, setSelectedVarKeys] = useState<string[]>([
    'temperature_2m_mean', 'temperature_2m_max', 'temperature_2m_min',
    'relative_humidity_2m_mean',
  ]);
  const [exploreResult, setExploreResult] = useState<WeatherResult | null>(null);
  const [exploring,     setExploring]     = useState(false);
  const [tablePage,     setTablePage]     = useState(0);
  const TABLE_PAGE_SIZE = 20;

  // Auto-detect granularity
  const granularity: 'daily' | 'hourly' =
    daysDiff(startDate, endDate) <= 3 ? 'hourly' : 'daily';

  const availableVars = granularity === 'hourly' ? HOURLY_VARIABLES : DAILY_VARIABLES;

  // Reset selected vars when granularity changes (some keys differ)
  useEffect(() => {
    if (granularity === 'hourly') {
      setSelectedVarKeys(prev => {
        const hourlyKeys = HOURLY_VARIABLES.map(v => v.key);
        const valid = prev.map(k => {
          const daily = DAILY_VARIABLES.find(v => v.key === k);
          return daily?.keyHourly ?? (hourlyKeys.includes(k) ? k : null);
        }).filter(Boolean) as string[];
        return valid.length > 0 ? valid : [HOURLY_VARIABLES[0].key];
      });
    } else {
      setSelectedVarKeys(prev => {
        const dailyKeys = DAILY_VARIABLES.map(v => v.key);
        const valid = prev.filter(k => dailyKeys.includes(k));
        return valid.length > 0 ? valid : ['temperature_2m_mean', 'temperature_2m_max'];
      });
    }
  }, [granularity]);

  // ── Close dropdown ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Debounced search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]); setShowDropdown(false); return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const locs = await searchLocations(query);
        setResults(locs);
        setShowDropdown(locs.length > 0);
      } catch {
        toast.error('Recherche impossible — vérifiez votre connexion');
      } finally {
        setSearching(false);
      }
    }, 420);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelectLocation = async (loc: GeoLocation) => {
    setShowDropdown(false);
    setQuery('');
    setSettings(prev => ({ ...prev, location: loc }));
    setExploreResult(null);
    await doFetchMonthly(loc);
  };

  const doFetchMonthly = async (loc: GeoLocation) => {
    setFetchingMonthly(true);
    setMonthlyOk(null);
    try {
      const temps = await fetchMonthlyTemps(loc.latitude, loc.longitude);
      setSettings(prev => ({
        ...prev,
        monthly_temps: temps,
        fetched_at: new Date().toISOString(),
      }));
      setMonthlyOk(true);
      toast.success(`Températures de ${loc.name} mises à jour`);
    } catch (err) {
      setMonthlyOk(false);
      toast.error(err instanceof Error ? err.message : 'Erreur API météo');
    } finally {
      setFetchingMonthly(false);
    }
  };

  const handleExplore = async () => {
    if (!startDate || !endDate) { toast.error('Dates requises'); return; }
    if (startDate > endDate) { toast.error('La date de début doit être avant la date de fin'); return; }
    if (selectedVarKeys.length === 0) { toast.error('Sélectionnez au moins une variable'); return; }

    setExploring(true);
    setTablePage(0);
    try {
      const result = await fetchWeatherRange(
        settings.location.latitude,
        settings.location.longitude,
        startDate,
        endDate,
        selectedVarKeys,
        granularity,
      );
      setExploreResult(result);
      toast.success(`${result.records.length} enregistrements chargés depuis Open-Meteo`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setExploring(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          energy_settings: { ...energyMeta, meteo_settings: settings },
        },
      });
      if (error) throw error;
      toast.success('Paramètres météo sauvegardés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const toggleVar = (key: string) => {
    setSelectedVarKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const { location, monthly_temps, comfort_threshold, coef_c, coef_g } = settings;

  return (
    <div className="space-y-4">

      {/* ── Location card (always visible) ── */}
      <Card className="bg-[#1a1d2e] border-slate-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            {/* Search field */}
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                {searching
                  ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 animate-spin" />
                  : <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                }
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher une ville — Ex: Thiès, Ziguinchor, Saint-Louis..."
                  className={cn(inputCls, 'pl-9')}
                  onFocus={() => results.length > 0 && setShowDropdown(true)}
                />
              </div>

              {showDropdown && results.length > 0 && (
                <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-[#1e2235] border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden">
                  {results.map((r, idx) => (
                    <button
                      key={r.id}
                      onMouseDown={e => { e.preventDefault(); handleSelectLocation(r); }}
                      className={cn(
                        'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-700/40 transition-colors',
                        idx < results.length - 1 && 'border-b border-slate-800/60',
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {r.name}
                          {r.admin1 && r.admin1 !== r.name &&
                            <span className="font-normal text-slate-400">, {r.admin1}</span>
                          }
                          {r.admin2 && r.admin2 !== r.admin1 &&
                            <span className="font-normal text-slate-500"> · {r.admin2}</span>
                          }
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{r.country}</p>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <p className="text-[10px] font-mono text-slate-500">
                          {r.latitude.toFixed(4)}° N
                        </p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {r.longitude.toFixed(4)}° E
                        </p>
                        {r.elevation != null &&
                          <p className="text-[10px] text-slate-600">{r.elevation} m</p>
                        }
                        {r.population != null &&
                          <p className="text-[10px] text-slate-600">
                            {r.population.toLocaleString('fr-FR')} hab.
                          </p>
                        }
                      </div>
                    </button>
                  ))}
                  <div className="px-3 py-1.5 border-t border-slate-800/60">
                    <p className="text-[9px] text-slate-600">
                      Source : Open-Meteo Geocoding API · {results.length} résultats
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Current location badge */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/30 bg-slate-800/20 px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <CloudSun className="h-5 w-5 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{location.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {[location.admin1, location.country].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-mono text-slate-400">
                    {location.latitude.toFixed(4)}° N · {location.longitude.toFixed(4)}° E
                  </p>
                  {location.elevation != null &&
                    <p className="text-[10px] text-slate-600">Élévation : {location.elevation} m</p>
                  }
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={fetchingMonthly}
                  onClick={() => doFetchMonthly(location)}
                  className="h-8 px-3 text-xs border-slate-700 bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-700"
                >
                  {fetchingMonthly
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />
                  }
                  <span className="ml-1.5">Actualiser</span>
                </Button>
              </div>
            </div>

            {/* Fetch badge */}
            {monthlyOk !== null && (
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
                monthlyOk
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300',
              )}>
                {monthlyOk
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  : <AlertCircle   className="h-3.5 w-3.5 shrink-0" />
                }
                {monthlyOk
                  ? `Données Open-Meteo Archive · Moyennes sur 3 ans · ${settings.fetched_at ? new Date(settings.fetched_at).toLocaleDateString('fr-FR') : ''}`
                  : 'Échec. Données précédentes conservées.'
                }
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── View tabs ── */}
      <div className="flex gap-1.5 p-1 bg-slate-800/40 rounded-xl border border-slate-800 w-fit">
        {([
          { id: 'config',  label: 'Configuration',  icon: Settings2 },
          { id: 'explore', label: 'Exploration météo', icon: BarChart2 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all',
              activeView === id
                ? 'bg-violet-600/20 border border-violet-500/30 text-violet-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ CONFIGURATION VIEW ══════════════════════════ */}
      {activeView === 'config' && (
        <>
          {/* Monthly temps */}
          <Card className="bg-[#1a1d2e] border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-500/15 shrink-0">
                    <Thermometer className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                  <CardTitle className="text-sm text-slate-100">
                    Températures extérieures de référence
                  </CardTitle>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-slate-500">
                    Min <span className="text-blue-300 font-mono font-semibold">
                      {Math.min(...monthly_temps)}°C
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Moy <span className="text-amber-300 font-mono font-semibold">
                      {Math.round(monthly_temps.reduce((a, b) => a + b, 0) / 12 * 10) / 10}°C
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Max <span className="text-red-300 font-mono font-semibold">
                      {Math.max(...monthly_temps)}°C
                    </span>
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 ml-8 mt-0.5">
                Utilisées dans les calculs BTU et corrections saisonnières.
                Source : Open-Meteo Archive · Moyennes 3 ans.
              </p>
            </CardHeader>
            <CardContent>
              <MonthBarChart temps={monthly_temps} />
              <div className="grid grid-cols-6 gap-2 mt-4">
                {monthly_temps.map((t, i) => (
                  <TempCell
                    key={i}
                    month={MONTHS[i]}
                    value={t}
                    onChange={v => {
                      const n = parseFloat(v);
                      if (isNaN(n)) return;
                      setSettings(prev => {
                        const t2 = [...prev.monthly_temps];
                        t2[i] = Math.round(n * 10) / 10;
                        return { ...prev, monthly_temps: t2 };
                      });
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <Info className="h-3 w-3 text-slate-600 shrink-0" />
                <p className="text-[10px] text-slate-600">
                  Cliquez sur une valeur pour la modifier manuellement ·
                  Open-Meteo Archive API · <code className="text-slate-500">temperature_2m_mean</code>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Comfort & coefs */}
          <Card className="bg-[#1a1d2e] border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-violet-500/15 shrink-0">
                  <Wind className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <CardTitle className="text-sm text-slate-100">
                  Paramètres de confort & coefficients BTU
                </CardTitle>
              </div>
              <p className="text-[11px] text-slate-500 ml-8 mt-0.5">
                Partagés avec l'onglet <span className="text-violet-300">Calculs & Énergie</span>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <CoefField
                  label="Confort intérieur"
                  unit="°C"
                  hint="Température cible (ex: 24)"
                  value={comfort_threshold}
                  color="text-cyan-400"
                  onChange={v => setSettings(p => ({ ...p, comfort_threshold: v }))}
                />
                <CoefField
                  label="CoefC — Isolation"
                  hint="Coefficient enveloppe bâtiment"
                  value={coef_c}
                  color="text-emerald-400"
                  step={0.1}
                  onChange={v => setSettings(p => ({ ...p, coef_c: v }))}
                />
                <CoefField
                  label="CoefG — Vitrage/Murs"
                  hint="Coefficient vitrage et murs ext."
                  value={coef_g}
                  color="text-amber-400"
                  step={0.1}
                  onChange={v => setSettings(p => ({ ...p, coef_g: v }))}
                />
              </div>
              <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 px-4 py-3">
                <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                  BTU = (Vol × <span className="text-emerald-400">CoefC</span>)
                  {' '}+ (Ouvertures × 1000)
                  {' '}+ (T_ext − <span className="text-cyan-400">T_confort</span>) × <span className="text-amber-400">CoefG</span> × Vol
                  {' '}+ (P_pers × nb_pers × 3.415)
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Sauvegarder les paramètres météo
          </Button>
        </>
      )}

      {/* ═══════════════════════ EXPLORATION VIEW ════════════════════════════ */}
      {activeView === 'explore' && (
        <>
          {/* Query builder */}
          <Card className="bg-[#1a1d2e] border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-500/15 shrink-0">
                  <Calendar className="h-3.5 w-3.5 text-sky-400" />
                </div>
                <CardTitle className="text-sm text-slate-100">Plage de dates</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Date pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400 font-medium">Date de début</Label>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={e => setStartDate(e.target.value)}
                    className={cn(inputCls, 'w-full px-3 cursor-pointer')}
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400 font-medium">Date de fin</Label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={daysAgo(5)}
                    onChange={e => setEndDate(e.target.value)}
                    className={cn(inputCls, 'w-full px-3 cursor-pointer')}
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Quick range buttons */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { label: 'Hier',     start: daysAgo(1),  end: daysAgo(1)  },
                  { label: '7 jours',  start: daysAgo(7),  end: daysAgo(1)  },
                  { label: '30 jours', start: daysAgo(30), end: daysAgo(1)  },
                  { label: '3 mois',   start: daysAgo(90), end: daysAgo(1)  },
                  { label: '6 mois',   start: daysAgo(180),end: daysAgo(1)  },
                  { label: '1 an',     start: daysAgo(365),end: daysAgo(1)  },
                ] as const).map(({ label, start, end }) => (
                  <button
                    key={label}
                    onClick={() => { setStartDate(start); setEndDate(end); }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
                      startDate === start && endDate === end
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Granularity info */}
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
                granularity === 'hourly'
                  ? 'bg-violet-500/10 border-violet-500/20 text-violet-300'
                  : 'bg-slate-800/40 border-slate-700/40 text-slate-400',
              )}>
                <Info className="h-3.5 w-3.5 shrink-0" />
                {granularity === 'hourly'
                  ? `Mode horaire activé (plage ≤ 3 jours) — données heure par heure`
                  : `Mode journalier — ${Math.round(daysDiff(startDate, endDate) + 1)} jours · ${Math.round(daysDiff(startDate, endDate) + 1)} enregistrements attendus`
                }
              </div>
            </CardContent>
          </Card>

          {/* Variable selector */}
          <Card className="bg-[#1a1d2e] border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/15 shrink-0">
                  <Database className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <CardTitle className="text-sm text-slate-100">Variables météorologiques</CardTitle>
              </div>
              <p className="text-[11px] text-slate-500 ml-8 mt-0.5">
                Source : Open-Meteo Archive API ·{' '}
                <code className="text-slate-400">{granularity === 'hourly' ? 'hourly' : 'daily'}</code>
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {availableVars.map(v => {
                  const selected = selectedVarKeys.includes(v.key);
                  return (
                    <button
                      key={v.key}
                      onClick={() => toggleVar(v.key)}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                        selected
                          ? 'border-opacity-50 bg-opacity-10'
                          : 'border-slate-700/40 bg-slate-800/20 hover:bg-slate-700/30 text-slate-400',
                      )}
                      style={selected ? {
                        borderColor: v.color + '55',
                        backgroundColor: v.color + '12',
                      } : undefined}
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: selected ? v.color : '#475569' }}
                      />
                      <div className="min-w-0">
                        <p className={cn('text-xs font-medium', selected ? 'text-slate-100' : 'text-slate-400')}>
                          {v.label}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5 truncate">{v.description}</p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: selected ? v.color : '#475569' }}>
                          {v.unit || 'sans unité'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Separator className="border-slate-800 my-4" />

              <Button
                onClick={handleExplore}
                disabled={exploring || selectedVarKeys.length === 0}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                size="sm"
              >
                {exploring
                  ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Chargement Open-Meteo...</>
                  : <><Database className="mr-2 h-3.5 w-3.5" />Charger les données</>
                }
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          {exploreResult && (
            <ExploreResults
              result={exploreResult}
              variables={availableVars.filter(v => exploreResult.variables.includes(v.key))}
              comfortThreshold={comfort_threshold}
              tablePage={tablePage}
              setTablePage={setTablePage}
              pageSize={TABLE_PAGE_SIZE}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── ExploreResults ───────────────────────────────────────────────────────────

function ExploreResults({
  result,
  variables,
  comfortThreshold,
  tablePage,
  setTablePage,
  pageSize,
}: {
  result: WeatherResult;
  variables: VariableMeta[];
  comfortThreshold: number;
  tablePage: number;
  setTablePage: (n: number) => void;
  pageSize: number;
}) {
  const { records } = result;

  // KPIs
  const stats = useMemo(
    () => Object.fromEntries(variables.map(v => [v.key, computeStats(records, v.key)])),
    [records, variables],
  );

  const dju = useMemo(() => {
    const hasMean = records.some(r => r.temperature_2m_mean != null);
    if (result.granularity !== 'daily' || !hasMean) return null;
    return computeDJU(records);
  }, [records, result.granularity]);

  // Chart toggle
  const [hiddenVars, setHiddenVars] = useState<Set<string>>(new Set());
  const toggleChartVar = (dataKey: string) => {
    setHiddenVars(prev => {
      const next = new Set(prev);
      next.has(dataKey) ? next.delete(dataKey) : next.add(dataKey);
      return next;
    });
  };

  // Chart data: truncate label for hourly
  const chartData = useMemo(() =>
    records.map(r => ({
      ...r,
      _label: result.granularity === 'hourly'
        ? r.time.split('T')[1]?.slice(0, 5) ?? r.time
        : r.time.slice(5), // MM-DD
    })),
    [records, result.granularity],
  );

  // Temp vars and other vars for dual Y axis
  const tempVars  = variables.filter(v => v.yAxis === 'temp');
  const otherVars = variables.filter(v => v.yAxis !== 'temp');

  // Table pagination
  const totalPages = Math.ceil(records.length / pageSize);
  const pageRecords = records.slice(tablePage * pageSize, (tablePage + 1) * pageSize);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {variables.slice(0, 4).map(v => {
          const s = stats[v.key];
          if (!s) return null;
          return (
            <div key={v.key} className="rounded-xl border border-slate-700/30 bg-[#1a1d2e] px-4 py-3">
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{v.label}</p>
              <p className="text-lg font-bold font-mono" style={{ color: v.color }}>
                {s.mean}{v.unit}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {s.min} – {s.max} {v.unit}
              </p>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <Card className="bg-[#1a1d2e] border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/15 shrink-0">
              <BarChart2 className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <CardTitle className="text-sm text-slate-100">
              Graphique · {records.length} points · Open-Meteo Archive
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="_label"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              {/* Left Y: temperature */}
              {tempVars.length > 0 && (
                <YAxis
                  yAxisId="temp"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  tickFormatter={v => `${v}°`}
                />
              )}
              {/* Right Y: other */}
              {otherVars.length > 0 && (
                <YAxis
                  yAxisId="other"
                  orientation="right"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
              )}
              <Tooltip
                contentStyle={{ background: '#1e2235', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                formatter={(value: any, name: string) => {
                  const meta = variables.find(v => v.key === name);
                  return [`${value ?? '—'} ${meta?.unit ?? ''}`, meta?.label ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}
                onClick={(data: any) => toggleChartVar(data.dataKey)}
                formatter={(value) => {
                  const meta = variables.find(v => v.key === value);
                  const hidden = hiddenVars.has(value);
                  return (
                    <span style={{ opacity: hidden ? 0.35 : 1, textDecoration: hidden ? 'line-through' : 'none' }}>
                      {meta?.label ?? value}
                    </span>
                  );
                }}
              />
              {/* Comfort reference line */}
              {tempVars.length > 0 && (
                <ReferenceLine
                  yAxisId="temp"
                  y={comfortThreshold}
                  stroke="#06b6d4"
                  strokeDasharray="4 4"
                  label={{ value: `Confort ${comfortThreshold}°C`, fill: '#06b6d4', fontSize: 10, position: 'insideTopLeft' }}
                />
              )}
              {tempVars.map(v => (
                <Line
                  key={v.key}
                  yAxisId="temp"
                  type="monotone"
                  dataKey={v.key}
                  stroke={v.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  hide={hiddenVars.has(v.key)}
                />
              ))}
              {otherVars.map(v => (
                <Line
                  key={v.key}
                  yAxisId="other"
                  type="monotone"
                  dataKey={v.key}
                  stroke={v.color}
                  strokeWidth={1.5}
                  strokeDasharray={v.yAxis === 'percent' ? undefined : '4 2'}
                  dot={false}
                  activeDot={{ r: 3 }}
                  hide={hiddenVars.has(v.key)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {dju && (
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">DJU Chauffage</p>
                <p className="text-xl font-bold font-mono text-blue-300">{dju.djc} <span className="text-xs text-slate-500 font-normal">°C·j</span></p>
                <p className="text-[10px] text-slate-600 mt-0.5">Σ max(0, 18 − T_moy) · base 18°C</p>
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">DJU Climatisation</p>
                <p className="text-xl font-bold font-mono text-orange-300">{dju.djf} <span className="text-xs text-slate-500 font-normal">°C·j</span></p>
                <p className="text-[10px] text-slate-600 mt-0.5">Σ max(0, T_moy − 18) · base 18°C</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data table */}
      <Card className="bg-[#1a1d2e] border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-slate-700/50 shrink-0">
                <Database className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <CardTitle className="text-sm text-slate-100">
                Données brutes · {records.length} enregistrements
              </CardTitle>
            </div>
            <p className="text-[10px] text-slate-500">
              Source : Open-Meteo Archive API ·{' '}
              <code>{result.location.latitude},{result.location.longitude}</code>
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
                    {result.granularity === 'hourly' ? 'Heure' : 'Date'}
                  </th>
                  {variables.map(v => (
                    <th
                      key={v.key}
                      className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap"
                      style={{ color: v.color }}
                    >
                      {v.label}
                      <span className="block text-[9px] text-slate-600 font-normal normal-case">{v.unit}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((r, i) => (
                  <tr
                    key={r.time}
                    className={cn(
                      'border-b border-slate-800/40 transition-colors hover:bg-slate-800/30',
                      i % 2 === 0 && 'bg-slate-900/20',
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-slate-300 whitespace-nowrap">
                      {result.granularity === 'hourly'
                        ? r.time.replace('T', ' ').slice(0, 16)
                        : r.time
                      }
                    </td>
                    {variables.map(v => {
                      const val = (r as any)[v.key] as number | null;
                      return (
                        <td key={v.key} className="px-3 py-2 text-right font-mono">
                          {val != null
                            ? <span style={{ color: v.color }}>{val.toFixed(1)}</span>
                            : <span className="text-slate-700">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {/* Stats footer */}
              <tfoot>
                {(['mean', 'min', 'max'] as const).map(stat => (
                  <tr key={stat} className="border-t border-slate-700/40 bg-slate-800/20">
                    <td className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      {{ mean: 'Moyenne', min: 'Minimum', max: 'Maximum' }[stat]}
                    </td>
                    {variables.map(v => {
                      const s = stats[v.key];
                      return (
                        <td key={v.key} className="px-3 py-2 text-right font-mono text-[11px]">
                          {s
                            ? <span style={{ color: v.color + 'cc' }}>{s[stat]}</span>
                            : <span className="text-slate-700">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
              <p className="text-[11px] text-slate-500">
                Page {tablePage + 1} / {totalPages} · {records.length} enregistrements
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tablePage === 0}
                  onClick={() => setTablePage(tablePage - 1)}
                  className="h-7 px-3 text-xs border-slate-700 bg-slate-800/50"
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tablePage >= totalPages - 1}
                  onClick={() => setTablePage(tablePage + 1)}
                  className="h-7 px-3 text-xs border-slate-700 bg-slate-800/50"
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TempCell({ month, value, onChange }: {
  month: string; value: number; onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{month}</span>
      {editing ? (
        <input
          type="number" defaultValue={value} step="0.1" autoFocus
          onBlur={e => { onChange(e.target.value); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onChange((e.target as HTMLInputElement).value); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full text-center h-9 text-sm font-mono rounded-lg border outline-none bg-amber-500/10 border-amber-500/40 text-amber-200"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Cliquer pour modifier"
          className={cn(
            'w-full h-9 rounded-lg border text-sm font-mono font-semibold',
            'hover:brightness-110 hover:scale-105 transition-all',
            tempColor(value),
          )}
        >
          {value.toFixed(1)}°
        </button>
      )}
    </div>
  );
}

function CoefField({ label, unit, hint, value, color, step = 1, onChange }: {
  label: string; unit?: string; hint: string;
  value: number; color: string; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400 font-medium">{label}</Label>
      <div className="relative">
        <input
          type="number" value={value} step={step}
          onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
          className={cn(
            'w-full h-9 px-3 rounded-lg border text-sm font-mono font-semibold text-right',
            'bg-slate-800/50 border-slate-700 outline-none',
            'focus:ring-2 focus:ring-violet-500/40', color,
          )}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-600">{hint}</p>
    </div>
  );
}

function MonthBarChart({ temps }: { temps: number[] }) {
  const min = Math.min(...temps) - 2;
  const max = Math.max(...temps) + 2;
  const range = max - min || 1;
  return (
    <div className="flex items-end gap-1 h-12 px-1">
      {temps.map((t, i) => {
        const pct = Math.max(5, ((t - min) / range) * 100);
        const cls = tempColor(t).split(' ')[1]; // bg-* class only
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className={cn('w-full rounded-t-sm', cls)} style={{ height: `${pct}%`, opacity: 0.65 }} />
          </div>
        );
      })}
    </div>
  );
}
