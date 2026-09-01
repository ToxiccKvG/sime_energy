// ============================================================
// IOT MODULE — Onglet Paramètres
// Gestion des comptes Shelly Cloud : ajout, modification,
// suppression, test de connexion. Zéro intervention développeur.
// ============================================================

import { useEffect, useState } from 'react';
import {
  Settings, Plus, Pencil, Trash2, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Eye, EyeOff, Server, KeyRound, Tag,
  AlertTriangle, Clock, Zap, Split,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchAccounts, upsertAccount, updateAccount, deleteAccount,
  toggleAccount, testSavedAccount, testNewAccount, maskAuthKey,
  type ShellyAccount, type ShellyAccountInput, type TestResult,
} from '@/lib/shelly-account-service';
import { forceMetadataRefresh } from '@/lib/shelly-device-config-service';
import { ShellyDeviceTypesPanel } from './ShellyDeviceTypesPanel';
import { ShellyDeviceChannelsPanel } from './ShellyDeviceChannelsPanel';

type SubTab = 'comptes' | 'types' | 'canaux';

const SUB_TABS: { id: SubTab; label: string; icon: typeof Settings }[] = [
  { id: 'comptes', label: 'Comptes Shelly Cloud',  icon: Settings },
  { id: 'types',   label: 'Types de dispositifs',  icon: Tag },
  { id: 'canaux',  label: 'Canaux multi-relais',   icon: Split },
];

// ── Types locaux ──────────────────────────────────────────────

interface FormState {
  site: string;
  label: string;
  auth_key: string;
  server_url: string;
  actif: boolean;
}

const EMPTY_FORM: FormState = {
  site: '', label: '', auth_key: '', server_url: 'https://shelly-xx-eu.shelly.cloud', actif: true,
};

// ══════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════

export function ParametresTab() {
  const [subTab, setSubTab]             = useState<SubTab>('comptes');
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
      setRefreshMsg(result.ok ? 'Refresh déclenché avec succès.' : `Échec : ${result.error}`);
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
      setError(String(e));
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
        server_url: form.server_url.trim().replace(/\/$/, ''),
        actif:      form.actif,
      };
      if (form.auth_key.trim()) payload.auth_key = form.auth_key.trim();
      if (editingId) {
        await updateAccount(editingId, payload);
      } else {
        await upsertAccount(payload);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(String(e));
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
      setError(String(e));
    }
  }

  // ── Toggle actif ────────────────────────────────────────────
  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleAccount(id, !current);
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, actif: !current } : a));
    } catch (e) {
      setError(String(e));
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

  // ── Rendu ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sous-navigation Paramètres */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {SUB_TABS.map(t => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'types' && <ShellyDeviceTypesPanel />}
      {subTab === 'canaux' && <ShellyDeviceChannelsPanel />}

      {subTab === 'comptes' && <>
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
            <Settings className="h-4 w-4 text-slate-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Comptes Shelly Cloud</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Gérez vos credentials ici — la collecte s'adapte en moins d'une minute.
              Les nouvelles pièces/dispositifs Shelly Cloud sont détectés automatiquement.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleForceRefresh} disabled={refreshing || refreshCooldown > 0}
            title="Forcer la détection immédiate des nouvelles pièces/dispositifs sans attendre le cycle de 10 min"
            className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <Zap className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-pulse' : ''}`} />
            {refreshCooldown > 0 ? `Refresh (${refreshCooldown}s)` : 'Forcer un refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}
            className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button size="sm" onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter un compte
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
          Chargement des comptes…
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-white/10 rounded-xl">
          <Server className="h-8 w-8 text-slate-600" />
          <p className="text-slate-400 text-sm">Aucun compte configuré</p>
          <Button size="sm" onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter le premier compte
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
              {editingId ? 'Modifier le compte' : 'Ajouter un compte'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
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
                <p className="text-xs text-slate-500">Le nom du site est la clé unique — non modifiable.</p>
              )}
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Label affiché (optionnel)
              </label>
              <Input
                placeholder="ex : Compte 2 — Académie CER2E"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            {/* Server URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Server className="h-3 w-3" /> URL du serveur Shelly Cloud
              </label>
              <Input
                placeholder="https://shelly-xx-eu.shelly.cloud"
                value={form.server_url}
                onChange={e => setForm(f => ({ ...f, server_url: e.target.value }))}
                className="bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            {/* Auth Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" /> Auth Key
              </label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={editingId ? 'Laisser vide pour conserver la clé actuelle' : "Coller l'auth key depuis Shelly Cloud"}
                  value={form.auth_key}
                  onChange={e => { setForm(f => ({ ...f, auth_key: e.target.value })); setFormTestResult(null); }}
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
                  La clé actuelle n'est jamais réaffichée pour des raisons de sécurité — laisser vide pour la conserver.
                </p>
              )}
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
              {saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sauvegarde…</> : 'Sauvegarder'}
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
              Supprimer le compte
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm py-2">
            La collecte de données s'arrêtera pour ce site au prochain poll.
            Cette action est irréversible.
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
              Supprimer définitivement
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
          {account.actif ? 'Actif' : 'Inactif'}
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
          title={account.actif ? 'Désactiver' : 'Activer'}
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
          title="Supprimer"
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
        <span>Aucun poll enregistré</span>
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
          <span>Erreur · {elapsedLabel}</span>
        </div>
        {account.last_error_msg && (
          <p className="text-red-500 text-[10px] pl-5 leading-tight truncate" title={account.last_error_msg}>
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
      <span>Dernier poll · {elapsedLabel}</span>
    </div>
  );
}
