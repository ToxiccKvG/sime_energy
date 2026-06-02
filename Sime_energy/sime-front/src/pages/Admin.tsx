import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Users, Inbox, Plus, Search, Loader2,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Mail, Shield, Trash2, UserPlus, AlertTriangle, LogIn,
} from 'lucide-react';

// ─── Super-admin guard ────────────────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = 'd.gassama@cer2e.com';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Org { id: string; name: string; slug?: string; description?: string; created_at: string; }
interface OrgUser { user_id: string; role: string; email?: string; first_name?: string; last_name?: string; }
interface JoinRequest {
  id: string; user_id: string; organization_id: string; message?: string;
  status: 'pending' | 'approved' | 'rejected'; created_at: string;
  user_email?: string; org_name?: string;
}
type Tab = 'orgs' | 'users' | 'requests';

// ─── Component ────────────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('orgs');

  // ── Guard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && user.email !== SUPER_ADMIN_EMAIL) navigate('/');
  }, [user, navigate]);

  if (!user || user.email !== SUPER_ADMIN_EMAIL) return null;

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      {/* Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/3 h-80 w-80 rounded-full bg-violet-600/6 blur-3xl" />
        <div className="absolute bottom-1/4 left-0 h-64 w-64 rounded-full bg-indigo-600/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-violet-400/70 font-semibold">
                Administration plateforme
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Dashboard Admin</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Gestion globale — organisations, utilisateurs et demandes d'accès
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="h-9 text-xs border border-white/10 text-slate-400 hover:text-white hover:border-white/20"
          >
            Retour à l'app
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
          {([
            { id: 'orgs', label: 'Organisations', icon: Building2 },
            { id: 'users', label: 'Utilisateurs', icon: Users },
            { id: 'requests', label: 'Demandes d\'accès', icon: Inbox },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all
                ${tab === id
                  ? 'bg-white/[0.08] text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'orgs' && <OrgsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'requests' && <RequestsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab — Organisations
// ═══════════════════════════════════════════════════════════════════════════════

function OrgsTab() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgUser[]>>({});
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [saving, setSaving] = useState(false);
  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('organizations').select('*').order('name');
    setOrgs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMembers = async (orgId: string) => {
    if (orgMembers[orgId]) return;
    const { data } = await supabase
      .from('organization_users')
      .select('user_id, role')
      .eq('organization_id', orgId);
    setOrgMembers((prev) => ({ ...prev, [orgId]: data ?? [] }));
  };

  const toggleExpand = async (orgId: string) => {
    if (expandedId === orgId) { setExpandedId(null); return; }
    setExpandedId(orgId);
    await loadMembers(orgId);
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('organizations').insert({
        name: newOrgName.trim(),
        slug: newOrgName.trim().toLowerCase().replace(/\s+/g, '-'),
        description: newOrgDesc.trim() || null,
      });
      if (error) throw error;
      toast.success(`Organisation "${newOrgName}" créée`);
      setNewOrgName(''); setNewOrgDesc(''); setCreating(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteOrgId) return;
    setInviting(true);
    try {
      // Call Supabase admin invite (via backend or direct)
      // For now: insert a placeholder — in prod this would call the backend /auth/invite
      toast.info('Invitation envoyée (nécessite le backend FastAPI /auth/invite)');
      setInviteEmail(''); setInviteOrgId(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setInviting(false); }
  };

  const filtered = search.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Rechercher une organisation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200 placeholder:text-slate-600 focus-visible:ring-white/20"
          />
        </div>
        <Button
          size="sm"
          onClick={() => setCreating((v) => !v)}
          className="h-9 gap-2 text-xs bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30"
          variant="ghost"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle organisation
        </Button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-violet-300">Créer une organisation</p>
          <Input
            placeholder="Nom de l'organisation *"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            className="h-9 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200 placeholder:text-slate-600"
          />
          <Input
            placeholder="Description (optionnelle)"
            value={newOrgDesc}
            onChange={(e) => setNewOrgDesc(e.target.value)}
            className="h-9 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200 placeholder:text-slate-600"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)} className="text-slate-500 h-8 text-xs">Annuler</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving} className="h-8 text-xs bg-violet-600 hover:bg-violet-500 text-white">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Créer'}
            </Button>
          </div>
        </div>
      )}

      {/* Org list */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.05]">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            <span className="text-sm text-slate-500">Chargement…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-600">
            <Building2 className="h-7 w-7" />
            <p className="text-sm">Aucune organisation</p>
          </div>
        ) : filtered.map((org) => (
          <div key={org.id}>
            <div
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors cursor-pointer"
              onClick={() => toggleExpand(org.id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                <Building2 className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">{org.name}</p>
                {org.description && <p className="text-xs text-slate-500 truncate">{org.description}</p>}
              </div>
              <span className="text-xs text-slate-600 hidden sm:block">
                {new Date(org.created_at).toLocaleDateString('fr-FR')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  sessionStorage.setItem('admin_view_org', JSON.stringify(org));
                  navigate('/');
                }}
                className="h-7 shrink-0 text-xs gap-1 bg-violet-600/15 border border-violet-500/20 text-violet-300 hover:bg-violet-600/30"
              >
                <LogIn className="w-3 h-3" />
                Entrer
              </Button>
              {expandedId === org.id
                ? <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
                : <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />}
            </div>

            {/* Expanded: members + invite */}
            {expandedId === org.id && (
              <div className="border-t border-white/[0.05] bg-white/[0.015] px-5 py-4 space-y-4">
                {/* Members */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Membres</p>
                  {!orgMembers[org.id] ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                  ) : orgMembers[org.id].length === 0 ? (
                    <p className="text-xs text-slate-600">Aucun membre</p>
                  ) : (
                    <div className="space-y-1.5">
                      {orgMembers[org.id].map((m) => (
                        <div key={m.user_id} className="flex items-center gap-3 text-xs">
                          <div className="h-6 w-6 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                            <Users className="h-3 w-3 text-slate-500" />
                          </div>
                          <span className="text-slate-400 font-mono truncate flex-1">{m.user_id.slice(0, 8)}…</span>
                          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 border ${
                            m.role === 'admin'
                              ? 'border-violet-500/30 text-violet-400 bg-violet-500/10'
                              : 'border-white/10 text-slate-500 bg-white/[0.03]'
                          }`}>
                            {m.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invite form */}
                <div className="border-t border-white/[0.05] pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Inviter un utilisateur</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="email@cer2e.com"
                      value={inviteOrgId === org.id ? inviteEmail : ''}
                      onChange={(e) => { setInviteEmail(e.target.value); setInviteOrgId(org.id); }}
                      className="flex-1 h-8 text-xs bg-white/[0.04] border-white/[0.08] text-slate-200 placeholder:text-slate-600"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                      className="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="member">Membre</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={() => { setInviteOrgId(org.id); handleInvite(); }}
                      disabled={inviting || !inviteEmail.trim()}
                      className="h-8 text-xs gap-1.5 bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/10"
                      variant="ghost"
                    >
                      <UserPlus className="w-3 h-3" />
                      Inviter
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab — Utilisateurs
// ═══════════════════════════════════════════════════════════════════════════════

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // organization_users joined to get org name
      const { data } = await supabase
        .from('organization_users')
        .select('user_id, role, organization_id, organizations(name)');
      setUsers(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = search.trim()
    ? users.filter((u) =>
        u.user_id?.toLowerCase().includes(search.toLowerCase()) ||
        (u.organizations as any)?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input
          placeholder="Rechercher par ID ou organisation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm bg-white/[0.04] border-white/[0.08] text-slate-200 placeholder:text-slate-600"
        />
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            <span className="text-sm text-slate-500">Chargement…</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">User ID</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Organisation</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rôle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((u, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-xs font-mono text-slate-400">{u.user_id?.slice(0, 12)}…</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm text-slate-300">{(u.organizations as any)?.name ?? '—'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 border ${
                      u.role === 'admin'
                        ? 'border-violet-500/30 text-violet-400 bg-violet-500/10'
                        : 'border-white/10 text-slate-500'
                    }`}>
                      {u.role}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-600">Aucun utilisateur trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab — Demandes d'accès
// ═══════════════════════════════════════════════════════════════════════════════

function RequestsTab() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: orgData }] = await Promise.all([
      supabase.from('join_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name'),
    ]);
    setRequests(reqs ?? []);
    setOrgs(orgData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getOrgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);

  const handleApprove = async (req: JoinRequest, role: 'member' | 'admin' = 'member') => {
    setProcessing(req.id);
    try {
      // Add to organization_users
      const { error: ouError } = await supabase
        .from('organization_users')
        .insert({ user_id: req.user_id, organization_id: req.organization_id, role });
      if (ouError && ouError.code !== '23505') throw ouError;

      // Update request status
      await supabase.from('join_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id);

      toast.success('Demande approuvée — utilisateur ajouté');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const handleReject = async (req: JoinRequest) => {
    setProcessing(req.id);
    try {
      await supabase.from('join_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', req.id);
      toast.success('Demande refusée');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const handled = requests.filter((r) => r.status !== 'pending');

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'pending') return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400"><Clock className="w-2.5 h-2.5" />En attente</span>;
    if (status === 'approved') return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />Approuvée</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400"><XCircle className="w-2.5 h-2.5" />Refusée</span>;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3">
      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      <span className="text-sm text-slate-500">Chargement…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-semibold text-slate-300">En attente ({pending.length})</p>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] py-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/40 mb-2" />
            <p className="text-sm text-slate-600">Aucune demande en attente</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
            {pending.map((req) => (
              <div key={req.id} className="px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs font-mono text-slate-400 truncate">{req.user_id.slice(0, 16)}…</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mt-1">
                      Demande pour <span className="text-violet-300">{getOrgName(req.organization_id)}</span>
                    </p>
                    {req.message && (
                      <p className="text-xs text-slate-500 mt-1 italic">"{req.message}"</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      {new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={processing === req.id}
                      onClick={() => handleReject(req)}
                      className="h-8 text-xs gap-1 border border-red-500/20 text-red-400 hover:bg-red-500/10"
                    >
                      <XCircle className="w-3 h-3" />
                      Refuser
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={processing === req.id}
                      onClick={() => handleApprove(req)}
                      className="h-8 text-xs gap-1 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      {processing === req.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><CheckCircle2 className="w-3 h-3" />Approuver</>
                      }
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Handled */}
      {handled.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Historique ({handled.length})</p>
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] divide-y divide-white/[0.04] overflow-hidden">
            {handled.map((req) => (
              <div key={req.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 font-mono truncate">{req.user_id.slice(0, 12)}…</p>
                  <p className="text-xs text-slate-400">{getOrgName(req.organization_id)}</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
