// ============================================================
// Dashboard IOT — Barre de filtres globaux (sticky)
// Filtres : Site · Compte Shelly · Famille · Pièce · Appareil · Période
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  fetchSites, fetchRooms, fetchDevices,
  ACCOUNT_BY_SITE, DEFAULT_FILTERS,
  type Device, type Filters, type Period, type DeviceFamily,
} from '@/lib/iot-dashboard-service';

const FAMILIES: { key: DeviceFamily; label: string; color: string }[] = [
  { key: 'ENERGIE_3PH', label: 'Énergie 3PH',    color: '#3b82f6' },
  { key: 'ENERGIE_2PH', label: 'Énergie 2PH',    color: '#06b6d4' },
  { key: 'ENERGIE_1PH', label: 'Énergie 1PH',    color: '#22c55e' },
  { key: 'LUMIERE',     label: 'Éclairage',      color: '#facc15' },
  { key: 'CAPTEUR_ENV', label: 'Capteur env.',   color: '#a855f7' },
  { key: 'ETAT',        label: 'État',           color: '#f97316' },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: '1h',   label: '1 h' },
  { key: '24h',  label: '24 h' },
  { key: '7d',   label: '7 j' },
  { key: '30d',  label: '30 j' },
];

const STORAGE_KEY = 'iot-dashboard-filters';

// ============================================================
// Multi-select popover générique — composant stable (hors FilterBar)
// API : reçoit la liste complète et un setter qui remplace tout
// ============================================================
interface MultiOption<T extends string> {
  value: T;
  label: string;
  color?: string;
  sub?: string;
}

function MultiPopover<T extends string>({
  label, items, selected, onSetSelected, emptyLabel = 'Tous',
  disabled = false,
}: {
  label: string;
  items: MultiOption<T>[];
  selected: T[];
  onSetSelected: (next: T[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const count = selected.length;
  const allSelected = items.length > 0 && items.every(i => selected.includes(i.value));

  const summary = useMemo(() => {
    if (count === 0) return emptyLabel;
    if (count === 1) return items.find(i => i.value === selected[0])?.label ?? `${count}`;
    if (count === items.length) return 'Toutes';
    return `${count} sélectionnés`;
  }, [count, selected, items, emptyLabel]);

  const toggleOne = (v: T) => {
    if (selected.includes(v)) onSetSelected(selected.filter(x => x !== v));
    else onSetSelected([...selected, v]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="bg-white/5 border-white/20 text-white text-xs h-8 gap-2 hover:bg-white/10"
        >
          <span className="text-slate-400">{label}</span>
          <span className="text-blue-300 font-medium">{summary}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(16rem,90vw)] bg-[#1a1d2e] border-white/20 p-2" align="start">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-slate-300 text-xs font-medium">
            {label}
            {items.length > 0 && <span className="text-slate-500 ml-1">({count}/{items.length})</span>}
          </span>
          <button
            type="button"
            onClick={() => onSetSelected(allSelected ? [] : items.map(i => i.value))}
            className="text-xs text-blue-400 hover:text-blue-300"
            disabled={items.length === 0}
          >
            {allSelected ? 'Aucun' : 'Tous'}
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {items.length === 0 ? (
            <p className="text-slate-500 text-xs px-2 py-2 italic">Aucune option disponible</p>
          ) : (
            items.map(it => (
              <label
                key={it.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected.includes(it.value)}
                  onCheckedChange={() => toggleOne(it.value)}
                />
                {it.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />}
                <span className="text-white text-xs flex-1 truncate">{it.label}</span>
                {it.sub && <span className="text-slate-500 text-[10px] truncate max-w-[120px]">{it.sub}</span>}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Composant principal
// ============================================================
interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function FilterBar({ filters, onChange }: Props) {
  const [sites, setSites]     = useState<string[]>([]);
  const [rooms, setRooms]     = useState<string[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [restored, setRestored] = useState(false);

  // Restauration localStorage AU MONTAGE (1x)
  useEffect(() => {
    if (restored) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Filters>;
        onChange({ ...DEFAULT_FILTERS, ...parsed });
      }
    } catch { /* ignore */ }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charger sites une fois
  useEffect(() => { fetchSites().then(setSites).catch(() => {}); }, []);

  // Charger rooms quand sites change
  useEffect(() => {
    fetchRooms(filters.sites.length > 0 ? filters.sites : undefined).then(setRooms).catch(() => {});
  }, [filters.sites]);

  // Charger appareils selon sites + familles
  useEffect(() => {
    fetchDevices(
      filters.sites.length > 0 ? filters.sites : undefined,
      filters.families.length > 0 ? filters.families : undefined,
    ).then(setDevices).catch(() => {});
  }, [filters.sites, filters.families]);

  // Liste des comptes Shelly uniques (basée sur les sites disponibles)
  const accountOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string; sub?: string }[] = [];
    for (const s of sites) {
      const acc = ACCOUNT_BY_SITE[s] ?? s;
      if (!seen.has(acc)) {
        seen.add(acc);
        out.push({ value: acc, label: acc, sub: s });
      }
    }
    return out;
  }, [sites]);

  // Comptes actuellement actifs = ceux dont au moins un site est sélectionné
  const selectedAccounts = useMemo(() => {
    return Array.from(new Set(filters.sites.map(s => ACCOUNT_BY_SITE[s] ?? s)));
  }, [filters.sites]);

  // ── Setters atomiques (un seul onChange par action) ─────────
  const setSites_ = (next: string[]) => onChange({ ...filters, sites: next, rooms: [], deviceIds: [] });
  const setAccounts_ = (next: string[]) => {
    const sitesForAccounts = sites.filter(s => next.includes(ACCOUNT_BY_SITE[s] ?? s));
    onChange({ ...filters, sites: sitesForAccounts, rooms: [], deviceIds: [] });
  };
  const setFamilies_ = (next: DeviceFamily[]) => onChange({ ...filters, families: next, deviceIds: [] });
  const setRooms_ = (next: string[]) => onChange({ ...filters, rooms: next, deviceIds: [] });
  const setDeviceIds_ = (next: string[]) => onChange({ ...filters, deviceIds: next });

  const setPeriod_ = (p: Period) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);
    const prevHour = Math.max(0, new Date().getHours() - 1);
    let extra: Partial<Filters> = {};
    if (p === '1h')  extra = { historicDate: today, historicHour: prevHour };
    if (p === '24h') extra = { historicDate: yesterday };
    if (p === '7d')  extra = { historicDateStart: new Date(Date.now() - 6 * 24 * 60 * 60_000).toISOString().slice(0, 10), historicDateEnd: today };
    if (p === '30d') extra = { historicDateStart: new Date(Date.now() - 29 * 24 * 60 * 60_000).toISOString().slice(0, 10), historicDateEnd: today };
    onChange({ ...filters, period: p, ...extra });
  };

  const reset = () => onChange({ ...DEFAULT_FILTERS });
  const save  = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* */ }
  };

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#0f111a]/95 backdrop-blur border-b border-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400 ml-1" />

        <MultiPopover
          label="Site"
          items={sites.map(s => ({ value: s, label: s, sub: ACCOUNT_BY_SITE[s]?.split(' — ')[0] }))}
          selected={filters.sites}
          onSetSelected={setSites_}
        />

        <MultiPopover
          label="Compte Shelly"
          items={accountOptions}
          selected={selectedAccounts}
          onSetSelected={setAccounts_}
        />

        <MultiPopover
          label="Famille"
          items={FAMILIES.map(f => ({ value: f.key, label: f.label, color: f.color }))}
          selected={filters.families}
          onSetSelected={setFamilies_}
        />

        <MultiPopover
          label="Pièce"
          items={rooms.map(r => ({ value: r, label: r }))}
          selected={filters.rooms}
          onSetSelected={setRooms_}
        />

        <MultiPopover
          label="Appareil"
          items={devices.map(d => ({
            value: d.device_id,
            label: d.name,
            sub: [d.site, d.room].filter(Boolean).join(' · '),
          }))}
          selected={filters.deviceIds}
          onSetSelected={setDeviceIds_}
        />

        <div className="flex items-center gap-1 ml-2 bg-white/5 border border-white/10 rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod_(p.key)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                filters.period === p.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Sélecteurs temporels — visibles uniquement en mode historique */}
        {filters.period === '1h' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="date"
              value={filters.historicDate}
              onChange={e => onChange({ ...filters, historicDate: e.target.value })}
              className="w-full sm:w-36 h-7 bg-white/5 border-white/20 text-white text-xs px-2"
            />
            <select
              value={filters.historicHour}
              onChange={e => onChange({ ...filters, historicHour: Number(e.target.value) })}
              className="h-7 bg-[#1a1d2e] border border-white/20 text-white text-xs rounded px-1.5"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}h00</option>
              ))}
            </select>
          </div>
        )}

        {filters.period === '24h' && (
          <Input
            type="date"
            value={filters.historicDate}
            onChange={e => onChange({ ...filters, historicDate: e.target.value })}
            className="w-full sm:w-36 h-7 bg-white/5 border-white/20 text-white text-xs px-2"
          />
        )}

        {(filters.period === '7d' || filters.period === '30d') && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="date"
              value={filters.historicDateStart}
              onChange={e => onChange({ ...filters, historicDateStart: e.target.value })}
              className="w-full sm:w-36 h-7 bg-white/5 border-white/20 text-white text-xs px-2"
            />
            <span className="text-slate-500 text-xs">→</span>
            <Input
              type="date"
              value={filters.historicDateEnd}
              onChange={e => onChange({ ...filters, historicDateEnd: e.target.value })}
              className="w-full sm:w-36 h-7 bg-white/5 border-white/20 text-white text-xs px-2"
            />
          </div>
        )}

        <div className="flex-1" />

        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400 hover:text-white"
          onClick={save} title="Sauvegarder la vue (localStorage)">
          <Save className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400 hover:text-white"
          onClick={reset} title="Réinitialiser les filtres">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
