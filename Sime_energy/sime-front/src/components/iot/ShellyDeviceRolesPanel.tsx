// ============================================================
// IOT MODULE — Paramètres > Rôles des appareils
//
// Rattache chaque device_id à son rôle dans l'architecture électrique
// (table shelly_device_roles) : c'est ce qui alimente le flux
// énergétique du dashboard et, à terme, les bilans d'audit.
//
// Trois zones :
//  1. Propositions à confirmer (origine auto, confirme_at NULL)
//  2. Appareils sans rôle, groupés par site, avec pré-remplissage par
//     famille (ENERGIE_1PH/LUMIERE → DEPART, CAPTEUR_ENV → AMBIANCE,
//     ETAT → AUTRE) — proposé, jamais imposé
//  3. Rattachements confirmés, modifiables
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { PlugZap, RefreshCw, XCircle, Trash2, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  fetchDeviceRoles, upsertDeviceRole, confirmDeviceRoles, deleteDeviceRole,
  DEVICE_ROLES, type ShellyDeviceRole, type DeviceRole,
} from '@/lib/shelly-device-role-service';
import { fetchDisponibles } from '@/lib/iot-supabase-service';

interface Appareil {
  device_id: string;
  name: string;
  site: string;
  room?: string | null;
  device_family: string;
}

// Rôle déductible de la famille — pré-remplissage du sélecteur, rien de plus.
function roleSuggere(family: string): DeviceRole | '' {
  if (family === 'ENERGIE_1PH' || family === 'LUMIERE') return 'DEPART';
  if (family === 'CAPTEUR_ENV') return 'AMBIANCE';
  if (family === 'ETAT') return 'AUTRE';
  return ''; // 3PH / 2PH / INCONNU : une vraie décision, pas de suggestion
}

const ROLE_LABEL = new Map(DEVICE_ROLES.map(r => [r.value, r.label]));

function RoleBadge({ role }: { role: DeviceRole }) {
  const bilan = ['M1_RESEAU', 'M2_SELECTEUR', 'M3_CHARGE', 'M4_GROUPE', 'M5_PV', 'BESS'].includes(role);
  return (
    <Badge className={`text-xs border-0 ${bilan ? 'bg-blue-500/15 text-blue-300' : 'bg-white/10 text-slate-300'}`}>
      {role}
    </Badge>
  );
}

export function ShellyDeviceRolesPanel() {
  const [roles, setRoles]         = useState<ShellyDeviceRole[]>([]);
  const [appareils, setAppareils] = useState<Appareil[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState<string | null>(null);
  // Sélections en attente dans la zone « sans rôle » (device_id → rôle choisi)
  const [pending, setPending]     = useState<Record<string, DeviceRole | ''>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, dispo] = await Promise.all([fetchDeviceRoles(), fetchDisponibles()]);
      setRoles(r);
      setAppareils(dispo.devices.map(d => ({
        device_id: d.device_id, name: d.name, site: d.site,
        room: d.room, device_family: d.device_family,
      })));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const parId    = useMemo(() => new Map(appareils.map(a => [a.device_id, a])), [appareils]);
  const roleParId = useMemo(() => new Map(roles.map(r => [r.device_id, r])), [roles]);

  const propositions = roles.filter(r => r.confirme_at == null);
  const confirmes    = roles.filter(r => r.confirme_at != null);
  const sansRole     = useMemo(
    () => appareils.filter(a => !roleParId.has(a.device_id)),
    [appareils, roleParId],
  );
  const sansRoleParSite = useMemo(() => {
    const map = new Map<string, Appareil[]>();
    for (const a of sansRole) {
      const list = map.get(a.site) ?? [];
      list.push(a);
      map.set(a.site, list);
    }
    for (const list of map.values()) list.sort((x, y) => x.name.localeCompare(y.name));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sansRole]);

  async function action(id: string, fn: () => Promise<void>) {
    setSaving(id);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(String(e)); }
    finally { setSaving(null); }
  }

  const confirmerUn = (deviceId: string) =>
    action(deviceId, () => confirmDeviceRoles([deviceId]));

  const confirmerTout = () =>
    action('__tout__', () => confirmDeviceRoles(propositions.map(p => p.device_id)));

  const rattacher = (a: Appareil, role: DeviceRole) =>
    action(a.device_id, async () => {
      await upsertDeviceRole({ device_id: a.device_id, role, libelle: a.name, origine: 'manuel' });
      // Un choix humain est une confirmation : pas de second clic à exiger.
      await confirmDeviceRoles([a.device_id]);
      setPending(p => { const n = { ...p }; delete n[a.device_id]; return n; });
    });

  /** Applique la suggestion par famille à tous les appareils déductibles du site. */
  const rattacherSuggeres = (site: string, liste: Appareil[]) =>
    action(`__site_${site}__`, async () => {
      const cibles = liste.filter(a => roleSuggere(a.device_family) !== '');
      for (const a of cibles) {
        await upsertDeviceRole({
          device_id: a.device_id,
          role: roleSuggere(a.device_family) as DeviceRole,
          libelle: a.name,
          origine: 'manuel',
        });
      }
      await confirmDeviceRoles(cibles.map(a => a.device_id));
    });

  const changerSensInverse = (r: ShellyDeviceRole, v: boolean) =>
    action(r.device_id, () => upsertDeviceRole({ ...r, sens_inverse: v }));

  const changerRole = (r: ShellyDeviceRole, role: DeviceRole) =>
    action(r.device_id, () => upsertDeviceRole({ ...r, role }));

  const supprimer = (deviceId: string) =>
    action(deviceId, () => deleteDeviceRole(deviceId));

  if (loading) {
    return (
      <div className="bg-white/5 rounded-xl border border-white/10 p-8 text-center">
        <RefreshCw className="h-5 w-5 text-slate-400 animate-spin mx-auto" />
      </div>
    );
  }

  const SelectRole = ({ value, onChange, disabled }: {
    value: DeviceRole | ''; onChange: (r: DeviceRole) => void; disabled?: boolean;
  }) => (
    <Select value={value || undefined} onValueChange={v => onChange(v as DeviceRole)} disabled={disabled}>
      <SelectTrigger className="h-8 w-full sm:w-64 text-xs bg-white/5 border-white/20 text-white">
        <SelectValue placeholder="Choisir un rôle…" />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1d2e] border-white/20">
        {DEVICE_ROLES.map(r => (
          <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── 1. Propositions à confirmer ─────────────────────────── */}
      {propositions.length > 0 && (
        <div className="bg-amber-500/5 rounded-xl border border-amber-500/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Propositions à confirmer · {propositions.length}
            </h3>
            <Button size="sm" onClick={confirmerTout} disabled={saving != null}
              className="h-7 text-xs bg-amber-600/80 hover:bg-amber-600">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Tout confirmer
            </Button>
          </div>
          <p className="text-slate-400 text-xs mb-3">
            Rattachements déduits automatiquement du nom de l'appareil. Le dashboard les
            utilise déjà, mais les signale « à confirmer » tant qu'un humain n'a pas validé.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs">Appareil</TableHead>
                  <TableHead className="text-slate-400 text-xs">Site</TableHead>
                  <TableHead className="text-slate-400 text-xs">Rôle proposé</TableHead>
                  <TableHead className="text-slate-400 text-xs w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {propositions.map(p => {
                  const a = parId.get(p.device_id);
                  return (
                    <TableRow key={p.device_id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="text-white text-xs">{a?.name ?? p.libelle ?? p.device_id}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{a?.site ?? '—'}</TableCell>
                      <TableCell><RoleBadge role={p.role} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => confirmerUn(p.device_id)}
                            disabled={saving != null}
                            className="h-7 px-2 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmer
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => supprimer(p.device_id)}
                            disabled={saving != null}
                            className="h-7 px-2 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                            title="Rejeter la proposition">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── 2. Appareils sans rôle ──────────────────────────────── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-1">
          <PlugZap className="h-4 w-4 text-blue-400" />
          Appareils sans rôle · {sansRole.length}
        </h3>
        <p className="text-slate-400 text-xs mb-3">
          Le rôle dit ce que l'appareil <em>mesure</em> dans l'architecture électrique —
          c'est lui qui alimente le flux énergétique du dashboard et les bilans.
        </p>
        {sansRole.length === 0 ? (
          <p className="text-green-400/80 text-xs py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Tous les appareils du catalogue sont rattachés.
          </p>
        ) : (
          <div className="space-y-4">
            {sansRoleParSite.map(([site, liste]) => {
              const nbSuggeres = liste.filter(a => roleSuggere(a.device_family) !== '').length;
              return (
                <div key={site}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wide">
                      {site} · {liste.length}
                    </h4>
                    {nbSuggeres > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => rattacherSuggeres(site, liste)}
                        disabled={saving != null}
                        className="h-7 px-2 text-xs text-blue-300 hover:text-blue-200 hover:bg-blue-500/10"
                        title="DEPART pour les prises/éclairages, AMBIANCE pour les capteurs, AUTRE pour les contacts — les compteurs 3PH/2PH restent à trancher un par un">
                        <Wand2 className="h-3.5 w-3.5 mr-1" />
                        Rattacher les {nbSuggeres} déductibles
                      </Button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableBody>
                        {liste.map(a => {
                          const suggestion = roleSuggere(a.device_family);
                          const choix = pending[a.device_id] ?? suggestion;
                          return (
                            <TableRow key={a.device_id} className="border-white/5 hover:bg-white/5">
                              <TableCell className="text-white text-xs min-w-40">
                                {a.name}
                                {a.room && <span className="text-slate-500 block text-[10px]">{a.room}</span>}
                              </TableCell>
                              <TableCell className="text-slate-500 text-xs">{a.device_family}</TableCell>
                              <TableCell>
                                <SelectRole
                                  value={choix}
                                  onChange={r => setPending(p => ({ ...p, [a.device_id]: r }))}
                                  disabled={saving != null}
                                />
                              </TableCell>
                              <TableCell className="w-28">
                                <Button size="sm" variant="ghost"
                                  onClick={() => choix && rattacher(a, choix)}
                                  disabled={!choix || saving != null}
                                  className="h-7 px-2 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10">
                                  {saving === a.device_id
                                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Rattacher</>}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Rattachements confirmés ──────────────────────────── */}
      {confirmes.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            Rattachements confirmés · {confirmes.length}
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs">Appareil</TableHead>
                  <TableHead className="text-slate-400 text-xs">Site</TableHead>
                  <TableHead className="text-slate-400 text-xs">Rôle</TableHead>
                  <TableHead className="text-slate-400 text-xs" title="Compteur dont le TC est monté à l'envers : production comptée en soutirage">Sens inversé</TableHead>
                  <TableHead className="text-slate-400 text-xs w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmes
                  .map(r => ({ r, a: parId.get(r.device_id) }))
                  .sort((x, y) => (x.a?.site ?? '').localeCompare(y.a?.site ?? '') || (x.a?.name ?? '').localeCompare(y.a?.name ?? ''))
                  .map(({ r, a }) => (
                    <TableRow key={r.device_id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="text-white text-xs">{a?.name ?? r.libelle ?? r.device_id}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{a?.site ?? '—'}</TableCell>
                      <TableCell>
                        <SelectRole value={r.role} onChange={role => changerRole(r, role)} disabled={saving != null} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`inv-${r.device_id}`}
                            checked={r.sens_inverse}
                            onCheckedChange={v => changerSensInverse(r, v)}
                            disabled={saving != null}
                            className="data-[state=checked]:bg-amber-500 scale-75"
                          />
                          {r.sens_inverse && (
                            <Label htmlFor={`inv-${r.device_id}`} className="text-amber-400 text-[10px]">inversé</Label>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => supprimer(r.device_id)}
                          disabled={saving != null}
                          className="h-7 px-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Détacher (l'appareil redevient sans rôle)">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
