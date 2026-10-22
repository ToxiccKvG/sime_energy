// ============================================================
// IOT MODULE — Onglet Paramètres
//
// Deux niveaux (chantier 3, 22/09/2026) :
//   · « Mes sites » — ce qu'un non-technicien fait seul : connecter un
//     compte Shelly, donner un rôle aux appareils ;
//   · « Réglages avancés » — repliés derrière un bouton : types de
//     matériel et canaux multi-prises, réglages techniques qu'on ne
//     touche que si un appareil n'est pas reconnu.
// La plateforme ne fait que LIRE Shelly Cloud : les appareils et les
// comptes se créent dans l'app Shelly, ici on les organise.
// ============================================================

import { useEffect, useState } from 'react';
import {
  Settings, Plus, Pencil, Trash2, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Eye, EyeOff, Server, KeyRound, Tag,
  AlertTriangle, Clock, Zap, Split, PlugZap, Wrench, ChevronDown, ChevronUp, Info, ExternalLink,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchAccounts, createAccount, updateAccount, deleteAccount,
  toggleAccount, testSavedAccount, testNewAccount, maskAuthKey, accountErrorMessage,
  type ShellyAccount, type ShellyAccountInput, type TestResult,
} from '@/lib/shelly-account-service';
import { forceMetadataRefresh } from '@/lib/shelly-device-config-service';
import { ShellyDeviceTypesPanel } from './ShellyDeviceTypesPanel';
import { ShellyDeviceRolesPanel } from './ShellyDeviceRolesPanel';
import { ShellyDeviceChannelsPanel } from './ShellyDeviceChannelsPanel';
import { useOrganization } from '@/context/OrganizationContext';

type SubTab = 'comptes' | 'roles' | 'types' | 'canaux';

/** Réglages courants — visibles d'emblée. */
const MAIN_TABS: { id: SubTab; label: string; icon: typeof Settings }[] = [
  { id: 'comptes', label: 'Connexions Shelly',    icon: Settings },
  { id: 'roles',   label: 'Rôle des appareils',   icon: PlugZap },
];

/** Réglages avancés — repliés, réservés aux cas où un appareil n'est pas reconnu. */
const ADVANCED_TABS: { id: SubTab; label: string; icon: typeof Settings }[] = [
  { id: 'types',   label: 'Types de matériel',    icon: Tag },
  { id: 'canaux',  label: 'Appareils multi-prises', icon: Split },
];

/**
 * Serveur Shelly Cloud : chaque compte est hébergé sur un serveur numéroté
 * (shelly-88-eu, shelly-97-eu, shelly-271-eu…) affiché dans l'app à côté de
 * la clé. Le numéro est imprévisible : au lieu d'une liste figée, on propose
 * les serveurs des sites déjà connectés et on laisse saisir les autres, avec
 * un exemple et la règle de construction de l'adresse.
 */
const OTHER_SERVER = '__autre__';

/** « https://shelly-88-eu.shelly.cloud » → « shelly-88-eu ». */
function serverShortName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\.shelly\.cloud\/?$/, '');
}

/** Accepte « shelly-88-eu », « shelly-88-eu.shelly.cloud » ou l'URL complète. */
function normalizeServer(input: string): string {
  const v = input.trim().replace(/\/$/, '');
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/\.shelly\.cloud$/i, '')}.shelly.cloud`;
}

// ── Types locaux ──────────────────────────────────────────────

interface FormState {
  site: string;
  label: string;
  auth_key: string;
  server_url: string;
  actif: boolean;
}

const EMPTY_FORM: FormState = {
  site: '', label: '', auth_key: '', server_url: '', actif: true,
};

// ══════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════

export function ParametresTab() {
  const { organization } = useOrganization();
  const [subTab, setSubTab]             = useState<SubTab>('comptes');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showKeyHelp, setShowKeyHelp]   = useState(false);
  const [serverManual, setServerManual] = useState(false);
  const [accounts, setAccounts]         = useState<ShellyAccount[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Forcer un refresh metadata (ne pas attendre le cycle 10 min)
  const [refreshing, setRefreshing]           = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [refreshMsg, setRefreshMsg]           = useState<string | null>(null);

  useEffect(() => {
    if (refreshCooldown <= 0) return;
    const t = setTimeout(() => setRefreshCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [refreshCooldown]);

  async function handleForceRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const result = await forceMetadataRefresh();
      setRefreshMsg(result.ok ? 'Recherche lancée — les nouveaux appareils apparaîtront dans la minute.' : `Échec : ${result.error}`);
      setRefreshCooldown(30); // évite de déclencher le rate limit Shelly Cloud
    } finally {
      setRefreshing(false);
    }
  }

  // Modal add/edit
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [showKey, setShowKey]           = useState(false);

  // Test de connexion
  const [testResults, setTestResults]   = useState<Record<string, TestResult & { loading?: boolean }>>({});

  // Confirmation suppression
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  // ── Chargement initial ──────────────────────────────────────
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await fetchAccounts());
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Ouvrir modal ajout ──────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowKey(false);
    setServerManual(false);
    setModalOpen(true);
  }

  // ── Ouvrir modal édition ────────────────────────────────────
  // auth_key n'est jamais renvoyée par le serveur (fix sécurité) :
  // le champ reste vide, laisser vide = conserver la clé actuelle.
  function openEdit(acc: ShellyAccount) {
    setEditingId(acc.id);
    setForm({
      site:       acc.site,
      label:      acc.label ?? '',
      auth_key:   '',
      server_url: acc.server_url,
      actif:      acc.actif,
    });
    setShowKey(false);
    setServerManual(!!acc.server_url);
    setModalOpen(true);
  }

  // ── Sauvegarder (créer ou mettre à jour) ────────────────────
  async function handleSave() {
    const requireKey = !editingId; // création : clé obligatoire ; édition : optionnelle
    if (!form.site.trim() || !form.server_url.trim() || (requireKey && !form.auth_key.trim())) return;
    setSaving(true);
    try {
      const payload: ShellyAccountInput = {
        site:       form.site.trim(),
        label:      form.label.trim() || null,
        server_url: normalizeServer(form.server_url),
        actif:      form.actif,
      };
      if (form.auth_key.trim()) payload.auth_key = form.auth_key.trim();
      if (editingId) {
        await updateAccount(editingId, payload);
      } else {
        if (!organization) throw new Error('Aucune organisation active : impossible de rattacher le site.');
        await createAccount(payload, organization.id);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Supprimer ───────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await deleteAccount(id);
      setDeleteId(null);
      await load();
    } catch (e) {
      setError(accountErrorMessage(e));
    }
  }

  // ── Toggle actif ────────────────────────────────────────────
  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleAccount(id, !current);
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, actif: !current } : a));
    } catch (e) {
      setError(accountErrorMessage(e));
    }
  }

  // ── Tester la connexion ─────────────────────────────────────
  // Passe par l'Edge Function avec l'id du compte : la clé est lue
  // côté serveur, jamais renvoyée au front.
  async function handleTest(acc: ShellyAccount) {
    setTestResults(prev => ({ ...prev, [acc.id]: { ok: false, loading: true } }));
    const result = await testSavedAccount(acc.id);
    setTestResults(prev => ({ ...prev, [acc.id]: result }));
  }

  // ── Tester depuis le formulaire ─────────────────────────────
  // Si une nouvelle clé est saisie (ou création), on la teste directement.
  // Sinon (édition, champ laissé vide), on teste la clé déjà enregistrée
  // via l'Edge Function, sans jamais la faire transiter par le front.
  const [formTestResult, setFormTestResult] = useState<TestResult | null>(null);
  const [formTesting, setFormTesting]       = useState(false);

  async function handleFormTest() {
    if (!form.server_url) return;
    if (!form.auth_key.trim() && !editingId) return;
    setFormTesting(true);
    setFormTestResult(null);
    const result = form.auth_key.trim()
      ? await testNewAccount(form.auth_key.trim(), form.server_url)
      : await testSavedAccount(editingId!);
    setFormTestResult(result);
    setFormTesting(false);
  }

  // Serveurs déjà utilisés par les sites connectés : le cas le plus fréquent
  // est d'ajouter un second compte sur le même serveur.
  const knownServers = Array.from(new Set(accounts.map(a => a.server_url).filter(Boolean))).sort();

  // ── Rendu ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sous-navigation : réglages courants, puis « Réglages avancés » repliés */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-px">
        {MAIN_TABS.map(t => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                active ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
        <button
          onClick={() => setAdvancedOpen(o => !o)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 border-transparent transition-colors ${
            advancedOpen || ADVANCED_TABS.some(t => t.id === subTab) ? 'text-slate-200' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Types de matériel et appareils multi-prises — à n'ouvrir que si un appareil n'est pas reconnu"
        >
          <Wrench className="h-3.5 w-3.5" />
          Réglages avancés
          {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {advancedOpen && ADVANCED_TABS.map(t => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                active ? 'border-amber-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {ADVANCED_TABS.some(t => t.id === subTab) && (
        <div className="flex items-start gap-2 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
          <span>
            Réglage technique. En temps normal, un appareil ajouté dans l'app Shelly est reconnu tout seul. N'intervenez ici
            que si un appareil apparaît comme « non reconnu » ou si un appareil à plusieurs prises n'affiche qu'une seule mesure.
          </span>
        </div>
      )}

      {subTab === 'types' && <ShellyDeviceTypesPanel />}
      {subTab === 'canaux' && <ShellyDeviceChannelsPanel />}
      {subTab === 'roles'  && <ShellyDeviceRolesPanel />}

      {subTab === 'comptes' && <>
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
            <Settings className="h-4 w-4 text-slate-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Connexions Shelly</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Un site = un compte Shelly Cloud connecté. Les appareils s'ajoutent dans l'app Shelly ;
              ils apparaissent ici d'eux-mêmes dans les 10 minutes.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleForceRefresh} disabled={refreshing || refreshCooldown > 0}
            title="Chercher tout de suite les appareils ajoutés dans l'app Shelly, sans attendre les 10 minutes"
            className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <Zap className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-pulse' : ''}`} />
            {refreshCooldown > 0 ? `Nouveaux appareils (${refreshCooldown}s)` : 'Chercher les nouveaux appareils'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}
            className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button size="sm" onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connecter un site
          </Button>
        </div>
      </div>

      {refreshMsg && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
          refreshMsg.startsWith('Échec') ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-green-500/10 text-green-300 border border-green-500/20'
        }`}>
          {refreshMsg.startsWith('Échec') ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {refreshMsg}
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Erreur</p>
            <p className="text-red-400 mt-0.5">{error}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300 h-6 px-2"
            onClick={() => setError(null)}>✕</Button>
        </div>
      )}

      {/* Liste des comptes */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Chargement des sites…
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-white/10 rounded-xl">
          <Server className="h-8 w-8 text-slate-600" />
          <p className="text-slate-400 text-sm">Aucun site connecté</p>
          <Button size="sm" onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Connecter le premier site
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map(acc => {
            const test = testResults[acc.id];
            return (
              <AccountCard
                key={acc.id}
                account={acc}
                testResult={test}
                onEdit={() => openEdit(acc)}
                onDelete={() => setDeleteId(acc.id)}
                onToggle={() => handleToggle(acc.id, acc.actif)}
                onTest={() => handleTest(acc)}
              />
            );
          })}
        </div>
      )}

      {/* ── Modal Add / Edit ────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-400" />
              {editingId ? 'Modifier la connexion' : 'Connecter un site'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingId && (
              <div className="flex items-start gap-2 text-xs text-slate-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
                <span>
                  Chaque site correspond à un compte Shelly Cloud. Les appareils se créent dans l'app Shelly ;
                  ici vous donnez seulement à la plateforme le droit de les lire.
                </span>
              </div>
            )}
            {/* Site */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Nom du site
              </label>
              <Input
                placeholder="ex : Académie CER2E"
                value={form.site}
                onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
                className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600"
                disabled={!!editingId}
              />
              {!!editingId && (
                <p className="text-xs text-slate-500">Le nom du site identifie toutes ses données — il ne se change pas.</p>
              )}
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Nom affiché (optionnel)
              </label>
              <Input
                placeholder="ex : Académie — bâtiment principal"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            {/* Clé de connexion */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5"><KeyRound className="h-3 w-3" /> Clé de connexion Shelly</span>
                <button type="button" onClick={() => setShowKeyHelp(v => !v)} className="text-blue-400 hover:text-blue-300 font-normal">
                  Où la trouver ?
                </button>
              </label>
              {showKeyHelp && (
                <ol className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2 space-y-1 list-decimal list-inside">
                  <li>Ouvrir l'app <strong>Shelly Smart Control</strong> ou <a href="https://control.shelly.cloud" target="_blank" rel="noreferrer" className="text-blue-400 inline-flex items-center gap-0.5">control.shelly.cloud <ExternalLink className="h-3 w-3" /></a>.</li>
                  <li>Menu <strong>Paramètres utilisateur</strong> → <strong>Clé d'autorisation cloud</strong> (« Authorization cloud key »).</li>
                  <li>Cliquer <strong>Obtenir la clé</strong>, puis la copier. Le nom du serveur (ex. <span className="font-mono">shelly-88-eu</span>) est affiché juste à côté.</li>
                </ol>
              )}
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={editingId ? 'Laisser vide pour conserver la clé actuelle' : 'Coller la clé copiée dans l’app Shelly'}
                  value={form.auth_key}
                  onChange={e => {
                    setForm(f => ({ ...f, auth_key: e.target.value }));
                    setFormTestResult(null);
                  }}
                  className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {editingId && (
                <p className="text-xs text-slate-500">
                  La clé actuelle n'est jamais réaffichée — laisser vide pour la conserver.
                </p>
              )}
            </div>

            {/* Serveur : liste plutôt qu'URL à taper */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Server className="h-3 w-3" /> Serveur Shelly (affiché à côté de la clé dans l'app)
              </label>
              {knownServers.length > 0 && (
                <select
                  value={knownServers.includes(form.server_url) ? form.server_url : (form.server_url || serverManual ? OTHER_SERVER : '')}
                  onChange={e => {
                    if (e.target.value === OTHER_SERVER) { setServerManual(true); setForm(f => ({ ...f, server_url: '' })); }
                    else { setServerManual(false); setForm(f => ({ ...f, server_url: e.target.value })); }
                  }}
                  className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-slate-100 text-sm px-3"
                >
                  <option value="" className="bg-[#0f111a]">— choisir —</option>
                  {knownServers.map(v => (
                    <option key={v} value={v} className="bg-[#0f111a]">{serverShortName(v)} (déjà utilisé)</option>
                  ))}
                  <option value={OTHER_SERVER} className="bg-[#0f111a]">Un autre serveur…</option>
                </select>
              )}
              {(serverManual || knownServers.length === 0) && (
                <Input
                  placeholder="ex : shelly-88-eu"
                  value={form.server_url}
                  onChange={e => setForm(f => ({ ...f, server_url: e.target.value }))}
                  onBlur={e => setForm(f => ({ ...f, server_url: normalizeServer(e.target.value) }))}
                  className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 font-mono text-sm"
                />
              )}
              <p className="text-xs text-slate-500">
                Le numéro varie d'un compte à l'autre — recopiez celui affiché dans l'app (ex. <span className="font-mono">shelly-88-eu</span>).
              </p>
            </div>

            {/* Bouton Tester depuis le formulaire */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline" size="sm"
                onClick={handleFormTest}
                disabled={formTesting || !form.server_url || (!form.auth_key.trim() && !editingId)}
                className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
              >
                {formTesting
                  ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Test en cours…</>
                  : <><Wifi className="h-3.5 w-3.5 mr-1.5" />Tester la connexion</>
                }
              </Button>
              {formTestResult && (
                formTestResult.ok
                  ? <span className="text-green-400 text-xs flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {formTestResult.nb_devices !== undefined
                        ? `${formTestResult.nb_devices} appareil(s) détecté(s)`
                        : 'Connexion OK'}
                    </span>
                  : <span className="text-red-400 text-xs flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      {formTestResult.error ?? 'Échec'}
                    </span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}
              className="text-slate-400 hover:text-white hover:bg-white/5">
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.site.trim() || !form.server_url.trim() || (!editingId && !form.auth_key.trim())}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enregistrement…</> : (editingId ? 'Enregistrer' : 'Connecter')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog confirmation suppression ─────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#0f111a] border-white/10 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              Déconnecter le site
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm py-2">
            La plateforme cessera de relever les appareils de ce site dans la minute. Les données déjà
            collectées restent consultables. Les appareils ne sont pas touchés dans l'app Shelly.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}
              className="text-slate-400 hover:text-white hover:bg-white/5">
              Annuler
            </Button>
            <Button
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Déconnecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Carte d'un compte
// ══════════════════════════════════════════════════════════════

interface AccountCardProps {
  account:    ShellyAccount;
  testResult?: TestResult & { loading?: boolean };
  onEdit:    () => void;
  onDelete:  () => void;
  onToggle:  () => void;
  onTest:    () => void;
}

function AccountCard({ account, testResult, onEdit, onDelete, onToggle, onTest }: AccountCardProps) {
  const isLoading = testResult?.loading;

  return (
    <div className={`
      rounded-xl border p-4 space-y-3 transition-all
      ${account.actif
        ? 'bg-white/5 border-white/10 hover:border-white/20'
        : 'bg-white/2 border-white/5 opacity-60'}
    `}>

      {/* En-tête carte */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {account.label ?? account.site}
          </p>
          <p className="text-slate-500 text-xs truncate mt-0.5">{account.site}</p>
        </div>
        <Badge className={`shrink-0 text-xs border-0 ${
          account.actif ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'
        }`}>
          {account.actif ? 'Relevé en cours' : 'En pause'}
        </Badge>
      </div>

      {/* Infos */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Server className="h-3 w-3 shrink-0 text-slate-600" />
          <span className="truncate">{account.server_url}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <KeyRound className="h-3 w-3 shrink-0 text-slate-600" />
          <span className="font-mono">{maskAuthKey(account.auth_key_last6)}</span>
        </div>
        <PollStatusLine account={account} />
      </div>

      {/* Résultat test */}
      {testResult && !isLoading && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${
          testResult.ok
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {testResult.ok
            ? <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {testResult.nb_devices !== undefined
                  ? `${testResult.nb_devices} appareil(s) détecté(s)`
                  : 'Connexion OK'}</>
            : <><XCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{testResult.error ?? 'Échec'}</span></>
          }
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
        <Button
          variant="ghost" size="sm"
          onClick={onTest}
          disabled={isLoading}
          className="flex-1 text-xs text-slate-400 hover:text-white hover:bg-white/5 h-7"
        >
          {isLoading
            ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Test…</>
            : account.actif
              ? <><Wifi    className="h-3 w-3 mr-1" />Tester</>
              : <><WifiOff className="h-3 w-3 mr-1" />Tester</>
          }
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onToggle}
          className="text-xs text-slate-400 hover:text-white hover:bg-white/5 h-7 px-2"
          title={account.actif ? 'Mettre les relevés en pause' : 'Reprendre les relevés'}
        >
          {account.actif ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5 text-green-400" />}
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onEdit}
          className="text-xs text-slate-400 hover:text-white hover:bg-white/5 h-7 px-2"
          title="Modifier"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onDelete}
          className="text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-7 px-2"
          title="Déconnecter le site"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Statut du dernier poll
// ══════════════════════════════════════════════════════════════

function PollStatusLine({ account }: { account: ShellyAccount }) {
  if (!account.last_poll_at) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Clock className="h-3 w-3 shrink-0" />
        <span>Aucun relevé encore</span>
      </div>
    );
  }

  const elapsed = Math.floor((Date.now() - new Date(account.last_poll_at).getTime()) / 1000);
  const elapsedLabel =
    elapsed < 60  ? `il y a ${elapsed}s` :
    elapsed < 3600 ? `il y a ${Math.floor(elapsed / 60)}min` :
    `il y a ${Math.floor(elapsed / 3600)}h`;

  const isStale = elapsed > 300; // > 5 min sans poll

  if (account.last_poll_status === 'error') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Relevé en erreur · {elapsedLabel}</span>
        </div>
        {account.last_error_msg && (
          <p className="text-red-500 text-[0.625rem] pl-5 leading-tight truncate" title={account.last_error_msg}>
            {account.last_error_msg.slice(0, 80)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${isStale ? 'text-yellow-400' : 'text-green-400'}`}>
      {isStale
        ? <AlertTriangle className="h-3 w-3 shrink-0" />
        : <CheckCircle2  className="h-3 w-3 shrink-0" />
      }
      <span>Dernier relevé · {elapsedLabel}</span>
    </div>
  );
}
