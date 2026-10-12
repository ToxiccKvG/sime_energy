// ============================================================
// IOT MODULE — Coupures : causes, énergie non distribuée (END)
//
// Liste les coupures détectées (table coupures), permet de qualifier
// la cause (déclencheur + aggravant éventuel) et de la CONFIRMER, puis
// répartit les coupures confirmées par cause dans un camembert.
// Une cause proposée par le système n'est jamais comptée comme acquise :
// le camembert ne porte que sur les coupures confirmées.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { PieOfPie, groupSmallParts } from '@/components/shared/PieOfPie';
import { usePalette, seriesColor } from '@/lib/chart-preferences';
import {
  fetchCauses, fetchCoupures, confirmCoupure, ORIGIN_LABELS,
  type Coupure, type CoupureCause,
} from '@/lib/coupure-service';
import { KpiInfoIcon, KpiTooltip, Term } from '@/components/shared/InfoTip';
import type { GlossaryKey } from '@/components/shared/glossary';

type Metric = 'nb' | 'duree' | 'end';
type Period = '30' | '90' | '365' | 'all';
const NONE = '__none__';

const nfr = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const fmtDuree = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

interface Draft { cause: string; aggravante: string | null; commentaire: string }

export function CoupuresTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const palette = usePalette();
  const [coupures, setCoupures] = useState<Coupure[]>([]);
  const [causes, setCauses] = useState<CoupureCause[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('90');
  const [metric, setMetric] = useState<Metric>('end');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = period === 'all' ? undefined : new Date(Date.now() - Number(period) * 86_400_000).toISOString();
      const [c, k] = await Promise.all([fetchCoupures(since), fetchCauses()]);
      setCoupures(c);
      setCauses(k);
      setDrafts({});
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const causeByCode = useMemo(() => new Map(causes.map((c) => [c.code, c])), [causes]);
  const sites = useMemo(() => Array.from(new Set(coupures.map((c) => c.site))).sort(), [coupures]);
  const rows = useMemo(() => coupures.filter((c) => site === 'all' || c.site === site), [coupures, site]);

  // « Fausse coupure » = trou de collecte : écartée de tous les totaux.
  const real = rows.filter((c) => causeByCode.get(c.cause_declencheur)?.origine !== 'non_retenue');
  const confirmed = real.filter((c) => c.statut_cause === 'confirmee');
  const totals = {
    n: real.length,
    minutes: real.reduce((a, c) => a + c.duree_min, 0),
    end: real.reduce((a, c) => a + (c.end_kwh ?? 0), 0),
  };

  const pieData = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of confirmed) {
      const v = metric === 'nb' ? 1 : metric === 'duree' ? c.duree_min / 60 : (c.end_kwh ?? 0);
      by.set(c.cause_declencheur, (by.get(c.cause_declencheur) ?? 0) + v);
    }
    const list = Array.from(by.entries())
      .map(([code, value], i) => ({ name: causeByCode.get(code)?.libelle ?? code, value, color: seriesColor(palette, i) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return { ...groupSmallParts(list, 5), total: list.reduce((a, r) => a + r.value, 0) };
  }, [confirmed, metric, causeByCode, palette]);
  const fmtMetric = (v: number) => (metric === 'nb' ? `${Math.round(v)} coupure${Math.round(v) > 1 ? 's' : ''}` : metric === 'duree' ? `${nfr(v)} h` : `${nfr(v, v < 10 ? 2 : 1)} kWh`);

  const draftOf = (c: Coupure): Draft => drafts[c.id] ?? { cause: c.cause_declencheur, aggravante: c.cause_aggravante, commentaire: c.commentaire ?? '' };
  const setDraft = (c: Coupure, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [c.id]: { ...draftOf(c), ...patch } }));
  const isDirty = (c: Coupure) => {
    const d = drafts[c.id];
    return !!d && (d.cause !== c.cause_declencheur || d.aggravante !== c.cause_aggravante || d.commentaire !== (c.commentaire ?? ''));
  };

  const confirm = async (c: Coupure) => {
    const d = draftOf(c);
    if (d.aggravante && d.aggravante === d.cause) {
      toast({ title: 'Cause aggravante identique', description: 'La cause aggravante doit différer du déclencheur.', variant: 'destructive' });
      return;
    }
    setSaving(c.id);
    try {
      await confirmCoupure(c.id, { cause_declencheur: d.cause, cause_aggravante: d.aggravante, commentaire: d.commentaire.trim() || null }, user?.id ?? null);
      await load();
    } catch (e) {
      toast({ title: 'Enregistrement impossible', description: String((e as Error).message ?? e), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const toConfirm = real.filter((c) => c.statut_cause === 'proposee').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={site} onValueChange={setSite}>
          <SelectTrigger className="w-48 h-9 bg-white/5 border-white/10 text-slate-200"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les sites</SelectItem>
            {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-44 h-9 bg-white/5 border-white/10 text-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="90">90 derniers jours</SelectItem>
            <SelectItem value="365">12 derniers mois</SelectItem>
            <SelectItem value="all">Tout l'historique</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && coupures.length === 0 && (
        <Card className="p-6 bg-white/5 border-white/10 text-sm text-slate-300">
          Aucune coupure enregistrée sur cette période. Les coupures sont détectées par le script
          <code className="mx-1 px-1 rounded bg-white/10">detect_coupures.py --save</code> (voir le runbook data).
        </Card>
      )}

      {coupures.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat term="coupures" label="Coupures" value={String(totals.n)} />
            <Stat term="dureeCumulee" label="Durée cumulée" value={fmtDuree(totals.minutes)} />
            <Stat term="end" label="Énergie non distribuée" value={`${nfr(totals.end, 2)} kWh`} />
            <Stat term="causesConfirmees" label="Causes confirmées" value={`${confirmed.length} / ${real.length}`} hint={toConfirm > 0 ? `${toConfirm} à confirmer` : 'tout est confirmé'} />
          </div>

          <Card className="p-4 bg-white/5 border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-slate-200">Répartition des coupures confirmées par cause</p>
              <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10" data-no-export>
                {([['end', 'Énergie non distribuée'], ['duree', 'Durée'], ['nb', 'Nombre']] as [Metric, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setMetric(k)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${metric === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{l}</button>
                ))}
              </div>
            </div>
            {pieData.total > 0 ? (
              <>
                <PieOfPie shown={pieData.shown} others={pieData.others} total={pieData.total} format={fmtMetric} labelMode="both" />
                <p className="text-xs text-center text-slate-300">Total : <span className="font-semibold">{fmtMetric(pieData.total)}</span> (= 100 %)</p>
              </>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">Aucune cause confirmée pour l'instant : confirmez les coupures dans le tableau ci-dessous.</p>
            )}
            {toConfirm > 0 && pieData.total > 0 && (
              <p className="text-[11px] text-amber-300/80 text-center mt-1">{toConfirm} coupure(s) non confirmée(s) ne figurent pas dans ce camembert.</p>
            )}
          </Card>

          <Card className="bg-white/5 border-white/10 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Début (UTC)</TableHead>
                  <TableHead>Fin (UTC)</TableHead>
                  <TableHead className="text-right"><Term k="end">END</Term></TableHead>
                  <TableHead className="text-right">Durée</TableHead>
                  <TableHead>Cause (déclencheur)</TableHead>
                  <TableHead>Cause aggravante</TableHead>
                  <TableHead>Commentaire</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const d = draftOf(c);
                  const proposed = c.statut_cause === 'proposee';
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.site}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(c.debut_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(c.fin_at)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{c.end_kwh === null ? '—' : `${nfr(c.end_kwh, 2)} kWh`}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{fmtDuree(c.duree_min)}</TableCell>
                      <TableCell className="min-w-[230px]">
                        <CauseSelect causes={causes} value={d.cause} onChange={(v) => setDraft(c, { cause: v })} />
                        {proposed && c.cause_indice && <p className="text-[11px] text-slate-400 mt-1">Proposition : {c.cause_indice}</p>}
                      </TableCell>
                      <TableCell className="min-w-[210px]">
                        <CauseSelect causes={causes} value={d.aggravante ?? NONE} allowNone onChange={(v) => setDraft(c, { aggravante: v === NONE ? null : v })} />
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <input
                          value={d.commentaire}
                          onChange={(e) => setDraft(c, { commentaire: e.target.value })}
                          placeholder="Commentaire…"
                          className="h-8 w-full px-2 rounded-md bg-white/5 border border-white/10 text-xs text-slate-200"
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {proposed ? (
                          <Button size="sm" className="h-8" disabled={saving === c.id} onClick={() => void confirm(c)}>
                            {saving === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                            Confirmer
                          </Button>
                        ) : isDirty(c) ? (
                          <Button size="sm" variant="outline" className="h-8" disabled={saving === c.id} onClick={() => void confirm(c)}>Enregistrer</Button>
                        ) : (
                          <Badge className="bg-emerald-600/30 text-emerald-300 border-0">Confirmée</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, term }: { label: string; value: string; hint?: string; term?: GlossaryKey }) {
  return (
    <KpiTooltip term={term} hint={hint}>
      <div className="p-3 bg-white/5 border border-white/10 rounded-lg h-full">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">{label}{(term || hint) && <KpiInfoIcon />}</div>
        <p className="text-lg font-semibold text-white mt-1">{value}</p>
      </div>
    </KpiTooltip>
  );
}

function CauseSelect({ causes, value, onChange, allowNone = false }: {
  causes: CoupureCause[]; value: string; onChange: (v: string) => void; allowNone?: boolean;
}) {
  const groups = (['externe', 'interne', 'a_qualifier', 'non_retenue'] as const)
    .map((o) => ({ o, items: causes.filter((c) => c.origine === o) }))
    .filter((g) => g.items.length > 0);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs text-slate-200"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>— aucune —</SelectItem>}
        {groups.map((g) => g.items.map((c) => (
          <SelectItem key={c.code} value={c.code}>{ORIGIN_LABELS[g.o]} · {c.libelle}</SelectItem>
        )))}
      </SelectContent>
    </Select>
  );
}
