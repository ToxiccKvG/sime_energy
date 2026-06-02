import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Building2, LogOut, Loader2, Clock, CheckCircle2,
  XCircle, Send, ArrowRight, Users, Search,
} from 'lucide-react';
import type { Organization } from '@/context/OrganizationContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JoinRequest {
  id: string;
  organization_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JoinOrganization() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog state
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingOrgs(true);
      try {
        const [{ data: orgData }, { data: reqData }] = await Promise.all([
          supabase.from('organizations').select('*').order('name'),
          supabase.from('join_requests').select('*').eq('user_id', user!.id),
        ]);
        setOrgs(orgData ?? []);
        setMyRequests(reqData ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingOrgs(false);
      }
    };
    if (user) load();
  }, [user]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getRequestForOrg = (orgId: string) =>
    myRequests.find((r) => r.organization_id === orgId) ?? null;

  const filteredOrgs = search.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  // ── Submit request ──────────────────────────────────────────────────────────
  const handleSendRequest = async () => {
    if (!selectedOrg || !user) return;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from('join_requests')
        .insert({ user_id: user.id, organization_id: selectedOrg.id, message: message.trim() || null })
        .select()
        .single();

      if (error) throw error;

      setMyRequests((prev) => [...prev, data]);
      setSelectedOrg(null);
      setMessage('');
      toast.success(`Demande envoyée pour "${selectedOrg.name}"`);
    } catch (e: any) {
      if (e?.code === '23505') {
        toast.error('Vous avez déjà une demande en cours pour cette organisation.');
      } else {
        toast.error('Impossible d\'envoyer la demande. Réessayez.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: 'pending' | 'approved' | 'rejected' }) => {
    if (status === 'pending')
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <Clock className="w-3 h-3" /> En attente
        </span>
      );
    if (status === 'approved')
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" /> Approuvée
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
        <XCircle className="w-3 h-3" /> Refusée
      </span>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080a10] text-white">

      {/* Atmospheric glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-600/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-indigo-600/6 blur-3xl" />
        <div className="absolute top-1/2 -left-20 h-64 w-64 rounded-full bg-slate-600/5 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">

        {/* ── Topbar ── */}
        <header className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img src="/logo-sime.png" alt="SIME" className="h-9 w-9 rounded-lg border border-white/10 bg-white p-0.5" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Plateforme interne</p>
              <p className="text-sm font-semibold text-slate-200">CER2E · SIME</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 hidden sm:block">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-8 gap-2 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              Déconnexion
            </Button>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="flex flex-1 flex-col items-center px-4 py-12">

          {/* Hero */}
          <div className="mb-10 text-center max-w-lg">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Building2 className="h-6 w-6 text-slate-300" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight sm:text-3xl">
              Rejoindre une organisation
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Votre compte est créé. Demandez l'accès à une organisation
              pour commencer à utiliser la plateforme.
            </p>
          </div>

          <div className="w-full max-w-2xl space-y-6">

            {/* Active requests summary */}
            {myRequests.some((r) => r.status === 'pending') && (
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">
                      {myRequests.filter((r) => r.status === 'pending').length} demande{myRequests.filter((r) => r.status === 'pending').length > 1 ? 's' : ''} en attente
                    </p>
                    <p className="text-xs text-amber-400/60 mt-0.5">
                      L'administrateur vous contactera par email une fois la demande traitée.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher une organisation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors"
              />
            </div>

            {/* Org list */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] overflow-hidden">
              {loadingOrgs ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                  <span className="text-sm text-slate-500">Chargement…</span>
                </div>
              ) : filteredOrgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Building2 className="h-8 w-8 text-slate-700" />
                  <p className="text-sm text-slate-600">Aucune organisation trouvée</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {filteredOrgs.map((org) => {
                    const req = getRequestForOrg(org.id);
                    const isSelected = selectedOrg?.id === org.id;

                    return (
                      <div key={org.id} className="group">
                        {/* Org row */}
                        <div
                          className={`flex items-center gap-4 px-5 py-4 transition-colors
                            ${isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}
                        >
                          {/* Icon */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                            <Building2 className="h-4 w-4 text-slate-400" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">{org.name}</p>
                            {org.description && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{org.description}</p>
                            )}
                          </div>

                          {/* Action */}
                          <div className="shrink-0">
                            {req ? (
                              <StatusBadge status={req.status} />
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => setSelectedOrg(isSelected ? null : org)}
                                className={`h-8 text-xs gap-1.5 transition-all ${
                                  isSelected
                                    ? 'bg-white/10 text-slate-300 border border-white/15 hover:bg-white/15'
                                    : 'bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                                }`}
                                variant="ghost"
                              >
                                {isSelected ? 'Annuler' : <><Send className="w-3 h-3" />Demander</>}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Inline request form */}
                        {isSelected && !req && (
                          <div className="border-t border-white/[0.05] bg-white/[0.02] px-5 py-4 space-y-3">
                            <p className="text-xs text-slate-400">
                              Message optionnel pour l'administrateur
                            </p>
                            <Textarea
                              placeholder="Ex : Je suis auditeur énergétique chez CER2E et je dois accéder aux audits de cette organisation."
                              value={message}
                              onChange={(e) => setMessage(e.target.value)}
                              rows={3}
                              className="text-sm bg-white/[0.04] border-white/10 text-slate-200 placeholder:text-slate-600 resize-none focus-visible:ring-white/20 focus-visible:border-white/20"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSelectedOrg(null); setMessage(''); }}
                                className="h-8 text-xs text-slate-500 hover:text-slate-300"
                              >
                                Annuler
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSendRequest}
                                disabled={sending}
                                className="h-8 text-xs bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 gap-1.5"
                                variant="ghost"
                              >
                                {sending
                                  ? <><Loader2 className="w-3 h-3 animate-spin" />Envoi…</>
                                  : <><ArrowRight className="w-3 h-3" />Envoyer la demande</>
                                }
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Members count hint */}
            <p className="text-center text-xs text-slate-600">
              <Users className="inline w-3 h-3 mr-1 mb-0.5" />
              {orgs.length} organisation{orgs.length > 1 ? 's' : ''} disponible{orgs.length > 1 ? 's' : ''} sur la plateforme
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
