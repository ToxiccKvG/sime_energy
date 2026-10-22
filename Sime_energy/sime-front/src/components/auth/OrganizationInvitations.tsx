/**
 * Inviter un membre (page Mon compte) — accès sur invitation seulement.
 *
 * Décision du 21/10/2026 : plus d'inscription libre. Un admin saisit
 * l'e-mail et le rôle (membre ou admin) ; la fonction serveur
 * `inviter-membre` enregistre l'invitation et renvoie un lien personnel,
 * que l'admin copie et transmet lui-même (WhatsApp, mail…) :
 *  - personne sans compte : elle ouvre le lien, choisit son mot de passe
 *    et rejoint l'organisation ;
 *  - personne qui a déjà un compte : elle se connecte puis accepte.
 * L'invitation vaut 7 jours ; un lien de création de compte doit être ouvert
 * dans les 24 h (sinon « Nouveau lien »). Pas d'e-mail automatique pour
 * l'instant (option retenue le 21/10).
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  getMonRole, getOrganizationInvitations, inviterMembre, revokeInvitation, type OrganizationInvitation,
} from '@/lib/organization-invitation-service';
import { Check, Copy, Loader2, RefreshCw, Send, Trash2, UserPlus } from 'lucide-react';

interface Props {
  organizationId: string;
  organizationName: string;
}

const STATUS_LABEL: Record<OrganizationInvitation['status'], string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  expired: 'Expirée',
  revoked: 'Annulée',
};

const ROLE_LABEL = { member: 'Membre', admin: 'Admin' } as const;

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export function OrganizationInvitations({ organizationId, organizationName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [monRole, setMonRole] = useState<'member' | 'admin' | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [creating, setCreating] = useState(false);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dernier, setDernier] = useState<{ email: string; lien: string; compteExistant: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      setInvitations(await getOrganizationInvitations(organizationId));
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : 'Impossible de charger les invitations', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (!user?.id) return;
    getMonRole(organizationId, user.id).then(setMonRole).catch(() => setMonRole(null));
  }, [organizationId, user?.id]);

  useEffect(() => { if (monRole === 'admin') reload(); }, [monRole, reload]);

  const copier = async (lien: string) => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copie impossible', description: 'Sélectionnez le lien et copiez-le manuellement.', variant: 'destructive' });
    }
  };

  const inviter = async (adresse: string, roleInvite: 'member' | 'admin', remplace?: OrganizationInvitation) => {
    const trimmed = adresse.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: 'E-mail invalide', description: 'Saisissez l\'adresse e-mail de la personne à inviter.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const inv = await inviterMembre(organizationId, trimmed, roleInvite);
      // « Nouveau lien » : l'ancienne invitation est annulée
      if (remplace) await revokeInvitation(remplace.id).catch(() => undefined);
      setDernier({ email: trimmed, lien: inv.lien, compteExistant: inv.compte_existant });
      setEmail('');
      await copier(inv.lien);
      toast({ title: 'Invitation créée, lien copié', description: `Transmettez-le à ${trimmed}.` });
      await reload();
    } catch (e) {
      toast({ title: 'Invitation impossible', description: e instanceof Error ? e.message : 'Erreur inconnue', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const annuler = async (inv: OrganizationInvitation) => {
    try {
      await revokeInvitation(inv.id);
      await reload();
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : 'Impossible d\'annuler', variant: 'destructive' });
    }
  };

  // Seuls les admins invitent
  if (monRole !== 'admin') return null;

  const pending = invitations.filter((i) => i.status === 'pending');
  const others = invitations.filter((i) => i.status !== 'pending').slice(0, 5);

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Send className="h-5 w-5" />
          Inviter un membre dans {organizationName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400">
          L'accès à la plateforme se fait sur invitation. Saisissez l'e-mail de la personne et son rôle, puis
          transmettez-lui le lien (WhatsApp, e-mail…). Sans compte, elle choisira son mot de passe en ouvrant le lien ;
          avec un compte, elle se connectera puis acceptera. Seul ce compte e-mail pourra utiliser l'invitation.
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            type="email"
            placeholder="prenom.nom@cer2e.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') inviter(email, role); }}
            className="md:flex-1 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="h-10 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2"
            title="Membre : consulte et analyse. Admin : gère aussi les comptes Shelly, les rôles d'appareils et les invitations."
          >
            <option value="member" className="bg-[#1a1d2e]">Membre</option>
            <option value="admin" className="bg-[#1a1d2e]">Admin</option>
          </select>
          <Button onClick={() => inviter(email, role)} disabled={creating} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Inviter
          </Button>
        </div>

        {dernier && (
          <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <p className="text-xs text-emerald-200">
              Lien pour {dernier.email} —{' '}
              {dernier.compteExistant
                ? 'cette personne a déjà un compte : elle se connecte puis accepte.'
                : 'à ouvrir dans les 24 h ; elle choisira son mot de passe.'}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs text-emerald-100" title={dernier.lien}>{dernier.lien}</code>
              <Button variant="ghost" size="sm" className="h-7 text-emerald-300 hover:text-white" onClick={() => copier(dernier.lien)}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-slate-200 mb-2">Invitations en attente {loading ? '' : `(${pending.length})`}</p>
          {loading ? (
            <p className="text-xs text-slate-500">Chargement…</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune invitation en attente.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
              {pending.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="text-slate-200">{inv.invited_email || 'Sans e-mail (ancien lien)'}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{ROLE_LABEL[inv.role ?? 'member']}</span>
                    <span className="block text-[11px] text-slate-500">créée le {fmtDate(inv.created_at)} · expire le {fmtDate(inv.expires_at)}</span>
                  </span>
                  {inv.invited_email && (
                    <Button variant="outline" size="sm" className="h-7 border-white/20 text-slate-300 hover:bg-white/5 text-xs"
                      disabled={creating} title="Crée un nouveau lien et annule celui-ci"
                      onClick={() => inviter(inv.invited_email!, inv.role ?? 'member', inv)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Nouveau lien
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Annuler l'invitation" onClick={() => annuler(inv)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {others.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">Historique récent</p>
            <ul className="space-y-0.5">
              {others.map((inv) => (
                <li key={inv.id} className="text-[11px] text-slate-500">
                  {STATUS_LABEL[inv.status]} · {inv.invited_email || 'lien ouvert'} · {fmtDate(inv.accepted_at || inv.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
