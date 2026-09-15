/**
 * Invitations par lien (page Mon compte).
 *
 * Un membre génère un lien `/invite?code=…` (12 caractères, 7 jours), le
 * transmet lui-même (mail, WhatsApp…) ; l'invité crée son compte ou se
 * connecte, ouvre le lien et accepte → il rejoint l'organisation via la RPC
 * `accept_invitation` (voir organization-invitation-service.ts). Pas d'envoi
 * d'e-mail automatique : l'ancien endpoint backend /auth/invite n'existe plus.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  createInvitation, getOrganizationInvitations, revokeInvitation, type OrganizationInvitation,
} from '@/lib/organization-invitation-service';
import { Check, Copy, Link2, Loader2, Send, Trash2 } from 'lucide-react';

const EXPIRES_DAYS = 7;

interface Props {
  organizationId: string;
  organizationName: string;
}

const STATUS_LABEL: Record<OrganizationInvitation['status'], string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  expired: 'Expirée',
  revoked: 'Révoquée',
};

function inviteUrl(code: string): string {
  return `${window.location.origin}/invite?code=${code}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export function OrganizationInvitations({ organizationId, organizationName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setInvitations(await getOrganizationInvitations(organizationId));
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : 'Impossible de charger les invitations', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => { reload(); }, [reload]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: 'Copie impossible', description: 'Sélectionnez le lien et copiez-le manuellement.', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!user?.id) return;
    const trimmed = email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: 'E-mail invalide', description: 'Corrigez l\'adresse ou laissez le champ vide.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const inv = await createInvitation(organizationId, user.id, trimmed || undefined, EXPIRES_DAYS);
      setLastLink(inviteUrl(inv.code));
      setEmail('');
      await copy(inv.code);
      toast({ title: 'Lien créé et copié', description: `Valable ${EXPIRES_DAYS} jours${trimmed ? `, réservé à ${trimmed}` : ''}.` });
      await reload();
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : 'Impossible de créer l\'invitation', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inv: OrganizationInvitation) => {
    try {
      await revokeInvitation(inv.id);
      if (lastLink === inviteUrl(inv.code)) setLastLink(null);
      await reload();
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : 'Impossible de révoquer', variant: 'destructive' });
    }
  };

  const pending = invitations.filter((i) => i.status === 'pending');
  const others = invitations.filter((i) => i.status !== 'pending').slice(0, 5);

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Send className="h-5 w-5" />
          Inviter dans {organizationName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400">
          Générez un lien d'invitation et transmettez-le vous-même (e-mail, WhatsApp…). La personne crée son compte
          ou se connecte, ouvre le lien et rejoint l'organisation. Le lien est valable {EXPIRES_DAYS} jours ; si vous
          indiquez un e-mail, seul ce compte pourra l'utiliser.
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            type="email"
            placeholder="E-mail de l'invité (facultatif)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            className="md:flex-1 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
          <Button onClick={handleCreate} disabled={creating} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Générer un lien
          </Button>
        </div>

        {lastLink && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <code className="flex-1 truncate text-xs text-emerald-200" title={lastLink}>{lastLink}</code>
            <Button variant="ghost" size="sm" className="h-7 text-emerald-300 hover:text-white" onClick={() => copy(lastLink.split('code=')[1])}>
              {copied === lastLink.split('code=')[1] ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
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
                    <span className="text-slate-200">{inv.invited_email || 'Lien ouvert (sans e-mail)'}</span>
                    <span className="block text-[11px] text-slate-500">créée le {fmtDate(inv.created_at)} · expire le {fmtDate(inv.expires_at)}</span>
                  </span>
                  <Button variant="outline" size="sm" className="h-7 border-white/20 text-slate-300 hover:bg-white/5 text-xs" onClick={() => copy(inv.code)}>
                    {copied === inv.code ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied === inv.code ? 'Copié' : 'Copier le lien'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Révoquer" onClick={() => handleRevoke(inv)}>
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
