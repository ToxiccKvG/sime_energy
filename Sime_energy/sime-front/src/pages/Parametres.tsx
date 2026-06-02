import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  User, Shield, Zap, Building2,
  Loader2, Mail, Calculator,
  Plus, X, CalendarDays, CloudSun, Wind,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { SENELEC_TARIFFS, CATEGORY_LABELS, setCustomTariffGrids } from '@/constants/senelec-tariffs';
import type { TariffYear } from '@/constants/senelec-tariffs';
import CalendrierTab from '@/components/parametres/CalendrierTab';
import MeteoTab from '@/components/parametres/MeteoTab';
import type { MeteoSettings } from '@/services/meteo-service';
import { DEFAULT_METEO_SETTINGS } from '@/services/meteo-service';

type Tab = 'compte' | 'securite' | 'energie' | 'meteo' | 'calendrier';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'compte',     label: 'Mon Compte',       icon: User,          desc: 'Profil & organisation' },
  { id: 'securite',   label: 'Sécurité',          icon: Shield,        desc: 'Mot de passe' },
  { id: 'energie',    label: 'Calculs & Énergie', icon: Zap,           desc: 'Grilles tarifaires SENELEC' },
  { id: 'meteo',      label: 'Météo & Climat',    icon: CloudSun,      desc: 'Températures & coeff. BTU' },
  { id: 'calendrier', label: 'Calendrier',         icon: CalendarDays,  desc: 'Jours fériés & événements' },
];

// ─── Tariff table config ─────────────────────────────────────────────────────

const TARIFF_SECTIONS: { label: string; domain: 'BT' | 'MT' | 'HT'; cats: string[]; hasTranches: boolean }[] = [
  { label: 'BT — Petite / Moyenne Puissance', domain: 'BT', cats: ['DPP', 'DMP', 'PPP', 'PMP'], hasTranches: true },
  { label: 'BT — Grande Puissance',            domain: 'BT', cats: ['DGP', 'PGP'],               hasTranches: false },
  { label: 'Moyenne Tension',                   domain: 'MT', cats: ['TCU', 'TG', 'TLU'],         hasTranches: false },
  { label: 'Haute Tension',                     domain: 'HT', cats: ['HTS', 'HTG'],               hasTranches: false },
];

const STANDARD_YEARS: TariffYear[] = [2017, 2019, 2023, 2026];

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export default function Parametres() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState<Tab>('compte');

  const meta          = user?.user_metadata || {};
  const energyMetaRaw = (meta.energy_settings || {}) as Record<string, any>;

  // ── Tariff grids ──
  const [activeYear, setActiveYear] = useState<number>(2023);
  const [addingYear, setAddingYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  const [grids, setGrids] = useState<Record<number, any>>(() => {
    const saved = (energyMetaRaw.custom_tariff_grids || {}) as Record<number, any>;
    const result: Record<number, any> = {};
    // Standard years always start from canonical constants — saved data only
    // applies to custom (non-standard) years so that updated defaults are always visible.
    for (const y of STANDARD_YEARS) {
      result[y] = deepClone(SENELEC_TARIFFS[y]);
    }
    // restore any extra custom years from saved data
    for (const y of Object.keys(saved).map(Number)) {
      if (!(STANDARD_YEARS as number[]).includes(y)) result[y] = saved[y];
    }
    return result;
  });

  const updateCell = (domain: string, cat: string, field: string, raw: string) => {
    const val = raw === '' ? null : parseFloat(raw);
    setGrids(prev => ({
      ...prev,
      [activeYear]: {
        ...prev[activeYear],
        [domain]: {
          ...prev[activeYear][domain],
          [cat]: { ...prev[activeYear][domain]?.[cat], [field]: isNaN(val as number) ? null : val },
        },
      },
    }));
  };

  const handleAddYear = () => {
    const year = parseInt(newYearInput);
    if (!year || year < 2000 || year > 2100) { toast.error('Année invalide'); return; }
    if (grids[year]) { toast.error('Cette année existe déjà'); return; }
    const existing = Object.keys(grids).map(Number).sort((a, b) => b - a);
    const source = existing.find(y => y <= year) ?? existing[0];
    setGrids(prev => ({ ...prev, [year]: deepClone(prev[source]) }));
    setActiveYear(year);
    setAddingYear(false);
    setNewYearInput('');
  };

  const handleRemoveYear = (year: number) => {
    if (STANDARD_YEARS.includes(year as TariffYear)) {
      toast.error('Impossible de supprimer une grille standard');
      return;
    }
    setGrids(prev => {
      const next = { ...prev };
      delete next[year];
      return next;
    });
    setActiveYear(2023);
  };

  // ── Mon Compte ──
  const [firstName, setFirstName] = useState<string>(meta.first_name || '');
  const [lastName,  setLastName]  = useState<string>(meta.last_name  || '');
  const [phone,     setPhone]     = useState<string>(meta.phone      || '');
  const [poste,     setPoste]     = useState<string>(meta.poste      || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Sécurité ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword]   = useState(false);

  // ── Calculs & Énergie ──
  const [savingEnergie, setSavingEnergie] = useState(false);

  // ── Coefs BTU partagés (Énergie ↔ Météo) ──
  const savedMeteo = (energyMetaRaw.meteo_settings ?? DEFAULT_METEO_SETTINGS) as MeteoSettings;
  const [coefC, setCoefC] = useState<number>(savedMeteo.coef_c ?? 0.8);
  const [coefG, setCoefG] = useState<number>(savedMeteo.coef_g ?? 1.2);
  const [comfortT, setComfortT] = useState<number>(savedMeteo.comfort_threshold ?? 24);

  const getInitials = () => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    return (user?.email?.[0] || 'U').toUpperCase();
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { first_name: firstName, last_name: lastName, phone, poste },
      });
      if (error) throw error;
      toast.success('Profil mis à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword) { toast.error('Entrez votre mot de passe actuel'); return; }
    if (!newPassword || newPassword.length < 6) { toast.error('Minimum 6 caractères'); return; }
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return; }
    setSavingPassword(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (authError) { toast.error('Mot de passe actuel incorrect'); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Mot de passe mis à jour');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveEnergie = async () => {
    setSavingEnergie(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          energy_settings: {
            ...energyMetaRaw,
            custom_tariff_grids: grids,
            // Persist coefs without overwriting the rest of meteo_settings
            meteo_settings: {
              ...(energyMetaRaw.meteo_settings ?? DEFAULT_METEO_SETTINGS),
              coef_c: coefC,
              coef_g: coefG,
              comfort_threshold: comfortT,
            },
          },
        },
      });
      if (error) throw error;
      setCustomTariffGrids(grids);
      toast.success('Paramètres de calcul sauvegardés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingEnergie(false);
    }
  };

  const sortedYears = Object.keys(grids).map(Number).sort((a, b) => a - b);

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      {/* Sidebar */}
      <aside className="w-full md:w-56 md:shrink-0">
        <div className="md:sticky md:top-6 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 mb-3">
            Paramètres
          </p>
          {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group',
                activeTab === id
                  ? 'bg-violet-600/15 border border-violet-500/30 text-violet-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-lg transition-colors shrink-0',
                activeTab === id
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium leading-none mb-0.5">{label}</p>
                <p className="text-[10px] text-slate-500 leading-none truncate">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 max-w-3xl space-y-5">

        {/* ─── Mon Compte ─── */}
        {activeTab === 'compte' && (
          <>
            <div className="flex items-center gap-4 px-5 py-4 bg-[#1a1d2e] border border-slate-800 rounded-2xl">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarFallback className="bg-violet-600/25 text-violet-300 text-lg font-bold border border-violet-500/30">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-base font-semibold text-slate-100">
                  {firstName && lastName ? `${firstName} ${lastName}` : user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-slate-400">{user?.email}</p>
                {organization && (
                  <p className="text-[11px] text-violet-400 mt-0.5 font-medium">{organization.name}</p>
                )}
              </div>
            </div>

            <Card className="bg-[#1a1d2e] border-slate-800">
              <CardHeader className="pb-4">
                <SectionHeader icon={<User className="h-3.5 w-3.5 text-blue-400" />} iconBg="bg-blue-500/15" title="Informations personnelles" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Prénom">
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jean" className={inputCls} />
                  </Field>
                  <Field label="Nom">
                    <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Diop" className={inputCls} />
                  </Field>
                </div>
                <Field label="Email">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <Input value={user?.email || ''} disabled className="bg-slate-800/30 border-slate-700/50 text-slate-500 h-9 text-sm pl-9 rounded-lg" />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Téléphone">
                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+221 77 000 00 00" className={inputCls} />
                  </Field>
                  <Field label="Poste / Fonction">
                    <Input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Auditeur énergétique" className={inputCls} />
                  </Field>
                </div>
                <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                  {savingProfile && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Enregistrer
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-[#1a1d2e] border-slate-800">
              <CardHeader className="pb-4">
                <SectionHeader icon={<Building2 className="h-3.5 w-3.5 text-emerald-400" />} iconBg="bg-emerald-500/15" title="Organisation" />
              </CardHeader>
              <CardContent>
                {organization ? (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
                    <InfoRow label="Nom" value={organization.name} />
                    {organization.slug && <InfoRow label="Identifiant" value={organization.slug} mono />}
                    {organization.description && <InfoRow label="Description" value={organization.description} />}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-700/30 bg-amber-500/10 p-4">
                    <p className="text-xs text-amber-300">
                      Vous n'êtes pas encore membre d'une organisation. Contactez votre administrateur ou créez-en une depuis la page de connexion.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── Sécurité ─── */}
        {activeTab === 'securite' && (
          <Card className="bg-[#1a1d2e] border-slate-800">
            <CardHeader className="pb-4">
              <SectionHeader icon={<Shield className="h-3.5 w-3.5 text-red-400" />} iconBg="bg-red-500/15" title="Changer le mot de passe" />
              <CardDescription className="text-xs text-slate-500 mt-1 ml-8">
                Entrez votre mot de passe actuel pour confirmer votre identité.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Mot de passe actuel">
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
              </Field>
              <Separator className="border-slate-800" />
              <Field label="Nouveau mot de passe">
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
                <p className="text-[10px] text-slate-500 mt-1">Minimum 6 caractères</p>
              </Field>
              <Field label="Confirmer le nouveau mot de passe">
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
              </Field>
              <Button
                onClick={handleSavePassword}
                disabled={savingPassword || !currentPassword || !newPassword}
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {savingPassword && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Mettre à jour le mot de passe
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Calculs & Énergie ─── */}
        {activeTab === 'energie' && (
          <>
            {/* ── Grilles tarifaires ── */}
            <Card className="bg-[#1a1d2e] border-slate-800">
              <CardHeader className="pb-3">
                <SectionHeader icon={<Calculator className="h-3.5 w-3.5 text-amber-400" />} iconBg="bg-amber-500/15" title="Grilles tarifaires SENELEC" />
              </CardHeader>
              <CardContent>
                {/* Year tabs */}
                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                  {sortedYears.map(y => {
                    const isStandard = (STANDARD_YEARS as number[]).includes(y);
                    return (
                      <div key={y} className="relative group">
                        <button
                          onClick={() => setActiveYear(y)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            activeYear === y
                              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                              : 'bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-slate-200'
                          )}
                        >
                          Grille {y}
                          {!isStandard && (
                            <span className="ml-1.5 text-[9px] bg-violet-500/20 text-violet-400 px-1 rounded">custom</span>
                          )}
                        </button>
                        {!isStandard && (
                          <button
                            onClick={() => handleRemoveYear(y)}
                            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-red-500/80 text-white"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add year */}
                  {addingYear ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={newYearInput}
                        onChange={e => setNewYearInput(e.target.value)}
                        placeholder="2027"
                        className="h-7 w-20 text-xs bg-slate-800/50 border-slate-700 text-slate-100 px-2"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddYear();
                          if (e.key === 'Escape') { setAddingYear(false); setNewYearInput(''); }
                        }}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300" onClick={handleAddYear}>OK</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={() => { setAddingYear(false); setNewYearInput(''); }}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingYear(true)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-dashed border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600 text-xs transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter une grille
                    </button>
                  )}
                </div>

                {/* Tariff table */}
                {grids[activeYear] && (
                  <TariffTable grid={grids[activeYear]} onUpdate={updateCell} />
                )}
              </CardContent>
            </Card>

            {/* ── Coefs BTU ── */}
            <Card className="bg-[#1a1d2e] border-slate-800">
              <CardHeader className="pb-4">
                <SectionHeader
                  icon={<Wind className="h-3.5 w-3.5 text-violet-400" />}
                  iconBg="bg-violet-500/15"
                  title="Coefficients BTU & Confort"
                />
                <CardDescription className="text-xs text-slate-500 mt-1 ml-8">
                  Partagés avec l'onglet <span className="text-violet-400">Météo & Climat</span>.
                  Modification ici mise à jour dans les deux onglets.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400 font-medium">Température de confort</Label>
                    <div className="relative">
                      <input
                        type="number"
                        value={comfortT}
                        step={1}
                        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setComfortT(n); }}
                        className="w-full h-9 px-3 pr-8 rounded-lg border text-sm font-mono font-semibold text-right bg-slate-800/50 border-slate-700 outline-none focus:ring-2 focus:ring-violet-500/40 text-cyan-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">°C</span>
                    </div>
                    <p className="text-[10px] text-slate-600">Seuil intérieur cible</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400 font-medium">CoefC — Isolation</Label>
                    <input
                      type="number"
                      value={coefC}
                      step={0.1}
                      onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setCoefC(n); }}
                      className="w-full h-9 px-3 rounded-lg border text-sm font-mono font-semibold text-right bg-slate-800/50 border-slate-700 outline-none focus:ring-2 focus:ring-violet-500/40 text-emerald-400"
                    />
                    <p className="text-[10px] text-slate-600">Coefficient enveloppe bâtiment</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400 font-medium">CoefG — Vitrage/Murs</Label>
                    <input
                      type="number"
                      value={coefG}
                      step={0.1}
                      onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setCoefG(n); }}
                      className="w-full h-9 px-3 rounded-lg border text-sm font-mono font-semibold text-right bg-slate-800/50 border-slate-700 outline-none focus:ring-2 focus:ring-violet-500/40 text-amber-400"
                    />
                    <p className="text-[10px] text-slate-600">Coefficient vitrage et murs ext.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveEnergie} disabled={savingEnergie} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
              {savingEnergie && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Sauvegarder les paramètres
            </Button>
          </>
        )}

        {/* ─── Météo & Climat ─── */}
        {activeTab === 'meteo' && <MeteoTab />}

        {/* ─── Calendrier ─── */}
        {activeTab === 'calendrier' && <CalendrierTab />}

      </div>
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const inputCls = 'bg-slate-800/50 border-slate-700 text-slate-100 h-9 text-sm rounded-lg focus-visible:ring-violet-500/40';

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon, iconBg, title }: { icon: React.ReactNode; iconBg: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('p-1.5 rounded-lg shrink-0', iconBg)}>{icon}</div>
      <CardTitle className="text-sm text-slate-100">{title}</CardTitle>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400 font-medium">{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-0.5">{label}</p>
      <p className={cn('text-sm text-slate-100', mono && 'font-mono text-slate-400 text-xs')}>{value}</p>
    </div>
  );
}

// ─── Tariff Table ─────────────────────────────────────────────────────────────

const COL_HEADERS = [
  { key: 't1', label: 'T1',  sub: 'FCFA/kWh' },
  { key: 't2', label: 'T2',  sub: 'FCFA/kWh' },
  { key: 't3', label: 'T3',  sub: 'FCFA/kWh' },
  { key: 'pf', label: 'Pf',  sub: 'FCFA/kW/mois' },
  { key: 'k1', label: 'K1',  sub: 'HHP · FCFA/kWh' },
  { key: 'k2', label: 'K2',  sub: 'HP · FCFA/kWh' },
];

const HAS_TRANCHES = new Set(['DPP', 'DMP', 'PPP', 'PMP']);

function TariffTable({ grid, onUpdate }: {
  grid: any;
  onUpdate: (domain: string, cat: string, field: string, val: string) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs border-collapse min-w-[580px]">
        <thead>
          <tr>
            <th className="text-left pb-2 pr-4 text-[9px] uppercase tracking-widest text-slate-500 font-semibold w-48">Catégorie</th>
            {COL_HEADERS.map(c => (
              <th key={c.key} className="text-right pb-2 px-2 text-[9px] uppercase tracking-widest text-slate-500 font-semibold whitespace-nowrap">
                {c.label}
                <br />
                <span className="text-[8px] text-slate-700 font-normal normal-case">{c.sub}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TARIFF_SECTIONS.map(section => (
            <React.Fragment key={section.label}>
              {/* Section header row */}
              <tr>
                <td colSpan={7} className="pt-3 pb-1">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded">
                    {section.label}
                  </span>
                </td>
              </tr>
              {/* Category rows */}
              {section.cats.map(cat => {
                const values = grid?.[section.domain]?.[cat] ?? {};
                const hasTr = HAS_TRANCHES.has(cat);
                const shortLabel = CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]
                  ?.split(' — ')[1]?.split(' (')[0] ?? '';
                return (
                  <tr key={cat} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                    <td className="py-1.5 pr-4">
                      <span className="font-mono font-semibold text-slate-300">{cat}</span>
                      {shortLabel && (
                        <span className="ml-2 text-[10px] text-slate-500 hidden sm:inline">{shortLabel}</span>
                      )}
                    </td>
                    {/* t1, t2, t3 */}
                    {['t1', 't2', 't3'].map(f => (
                      <td key={f} className="py-1 px-2 text-right">
                        {hasTr
                          ? <TariffCell value={values[f] ?? null} onSave={v => onUpdate(section.domain, cat, f, v)} />
                          : <span className="text-slate-700 text-xs">—</span>
                        }
                      </td>
                    ))}
                    {/* pf */}
                    <td className="py-1 px-2 text-right">
                      {!hasTr
                        ? <TariffCell value={values.pf ?? null} onSave={v => onUpdate(section.domain, cat, 'pf', v)} />
                        : <span className="text-slate-700 text-xs">—</span>
                      }
                    </td>
                    {/* k1, k2 */}
                    {['k1', 'k2'].map(f => (
                      <td key={f} className="py-1 px-2 text-right">
                        {!hasTr
                          ? <TariffCell value={values[f] ?? null} onSave={v => onUpdate(section.domain, cat, f, v)} />
                          : <span className="text-slate-700 text-xs">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-600 mt-3">
        Cliquez sur une valeur pour la modifier. Appuyez sur Entrée ou cliquez ailleurs pour valider.
      </p>
    </div>
  );
}

function TariffCell({ value, onSave }: { value: number | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="number"
        defaultValue={value ?? ''}
        onBlur={e => { onSave(e.target.value); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave((e.target as HTMLInputElement).value); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
        className="w-24 h-6 text-right text-[11px] bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded px-1.5 outline-none font-mono"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Cliquer pour modifier"
      className={cn(
        'w-24 text-right rounded px-1.5 py-0.5 text-[11px] font-mono hover:bg-slate-700/50 transition-colors group',
        value != null ? 'text-slate-200' : 'text-slate-600 italic'
      )}
    >
      {value != null ? (
        <>
          <span className="group-hover:hidden">{value.toFixed(2)}</span>
          <span className="hidden group-hover:inline text-amber-400/70">{value.toFixed(2)}</span>
        </>
      ) : (
        <span className="text-slate-700 not-italic text-xs">n/d</span>
      )}
    </button>
  );
}
