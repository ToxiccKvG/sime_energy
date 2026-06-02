import { Link } from 'react-router-dom';
import { useOrganization } from '@/context/OrganizationContext';
import { useAudits } from '@/hooks/useAudits';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

const STATUS = {
  planned:     { label: 'Planifié',  color: 'hsl(var(--status-planned))' },
  in_progress: { label: 'En cours',  color: 'hsl(var(--status-progress))' },
  completed:   { label: 'Terminé',   color: 'hsl(var(--status-done))' },
} as const;

function fmtPower(kw: number) {
  if (kw === 0) return '—';
  if (kw >= 1000) return `${(kw / 1000).toFixed(2)} MW`;
  return `${kw.toFixed(1)} kW`;
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function todayLabel() {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { organization } = useOrganization();

  const { data: audits = [], isPending: auditsLoading } = useAudits(organization?.id);
  const stats = useDashboardStats(audits);

  const loading = auditsLoading || (audits.length > 0 && stats.loading);

  if (loading) return <DashboardSkeleton />;

  const { sites, equipment, powerKW, invoices, activity } = stats;
  const inProgress = audits.filter((a) => a.status === 'in_progress').length;
  const completed = audits.filter((a) => a.status === 'completed').length;

  const metrics = [
    { value: String(audits.length), label: 'Projets', sub: `${inProgress} actif${inProgress !== 1 ? 's' : ''}` },
    { value: String(sites),         label: 'Sites',   sub: 'audités' },
    { value: String(equipment),     label: 'Équipements', sub: 'catalogués' },
    { value: fmtPower(powerKW),     label: 'Puissance', sub: 'installée estimée', mono: true },
  ];

  return (
    <div className="min-h-full">

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-muted-foreground mb-2 capitalize">
          {todayLabel()}
        </p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground tracking-tight leading-none">
              {organization?.name ?? 'Tableau de bord'}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Vue d'ensemble · Audit énergétique</p>
          </div>
          <div className="flex items-center gap-1.5 pb-1">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-muted-foreground font-mono">Live</span>
          </div>
        </div>
      </div>

      {/* ── Métriques — 4 grands chiffres, pas de boites ────────────────── */}
      <div className="border-t border-b border-border py-8 mb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={[
                'px-4 sm:px-8 py-3 sm:py-0',
                i % 2 !== 0 ? 'border-l border-border' : '',
                i > 0 ? 'sm:border-l sm:border-border' : '',
                i > 1 ? 'border-t sm:border-t-0 border-border' : '',
                i === 0 ? 'pl-0' : '',
              ].join(' ')}
            >
              <p className={`text-5xl font-bold text-foreground leading-none mb-2 ${m.mono ? 'font-mono' : ''}`}>
                {m.value}
              </p>
              <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Corps principal ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">

        {/* Projets — colonne principale */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-muted-foreground">
              Projets · {audits.length} au total
            </p>
            <Link
              to="/audits"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono"
            >
              Voir tout <ArrowRight className="size-3" />
            </Link>
          </div>

          {audits.length === 0 ? (
            <div className="border border-border rounded-xl p-12 text-center">
              <p className="text-sm text-muted-foreground font-mono">Aucun projet</p>
              <Link
                to="/audits"
                className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary/60 hover:text-primary transition-colors"
              >
                Créer le premier audit <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-0">
              {audits.map((audit, i) => {
                const cfg = STATUS[audit.status as keyof typeof STATUS] ?? STATUS.planned;
                const pct = audit.completion_percentage ?? 0;
                const isLast = i === audits.length - 1;

                return (
                  <Link
                    key={audit.id}
                    to={`/audits/${audit.id}`}
                    className={`flex items-center gap-6 py-5 group transition-all hover:pl-1 ${
                      !isLast ? 'border-b border-border' : ''
                    }`}
                  >
                    {/* Accent couleur projet */}
                    <div
                      className="w-0.5 h-8 rounded-full flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: audit.color ?? cfg.color }}
                    />

                    {/* Nom + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-foreground/75 group-hover:text-foreground transition-colors truncate leading-tight">
                        {audit.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-1">
                        {audit.start_date
                          ? new Date(audit.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                          : '—'}
                        {audit.responsable ? ` · ${audit.responsable}` : ''}
                      </p>
                    </div>

                    {/* Statut */}
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span className="text-[11px] font-mono" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Completion */}
                    <div className="w-28 flex-shrink-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground font-mono">{pct}%</span>
                      </div>
                      <div className="h-px bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: audit.color ?? cfg.color,
                          }}
                        />
                      </div>
                    </div>

                    <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}

          {/* Résumé statuts */}
          {audits.length > 0 && (
            <div className="flex gap-6 mt-6 pt-5 border-t border-border">
              {[
                { label: 'Planifiés',  count: audits.filter(a => a.status === 'planned').length,     color: STATUS.planned.color },
                { label: 'En cours',   count: inProgress,                                             color: STATUS.in_progress.color },
                { label: 'Terminés',   count: completed,                                              color: STATUS.completed.color },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-[11px] text-muted-foreground font-mono">{s.count} {s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activité — colonne secondaire */}
        <div className="lg:col-span-1">
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-muted-foreground mb-5">
            Activité récente
          </p>

          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">Aucune activité.</p>
          ) : (
            <div className="space-y-0">
              {activity.map((item, i) => {
                const isLast = i === activity.length - 1;
                return (
                  <div
                    key={item.id}
                    className={`flex gap-3 py-3.5 ${!isLast ? 'border-b border-border' : ''}`}
                  >
                    {/* Timeline dot */}
                    <div className="relative flex flex-col items-center flex-shrink-0 mt-1">
                      <div className="size-1.5 rounded-full bg-muted-foreground/20" />
                      {!isLast && <div className="w-px flex-1 bg-border mt-1.5 min-h-4" />}
                    </div>

                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-xs text-muted-foreground leading-snug">
                        {item.description ?? item.action ?? item.entity_type ?? 'Action'}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-1.5">
                        {fmtRelative(item.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modules state — compact */}
          <div className="mt-8 pt-6 border-t border-border space-y-3">
            <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-muted-foreground mb-4">
              État des modules
            </p>
            {[
              { label: 'Inventaire',  value: equipment, unit: 'équip.',  href: '/inventaire',  active: equipment > 0,  color: STATUS.completed.color },
              { label: 'Facturation', value: invoices,  unit: 'fact.',   href: '/facturation', active: invoices > 0,   color: STATUS.in_progress.color },
            ].map(mod => (
              <Link
                key={mod.label}
                to={mod.href}
                className="flex items-center gap-3 group"
              >
                <div
                  className={`size-1.5 rounded-full flex-shrink-0 ${mod.active ? '' : 'bg-muted-foreground/20'}`}
                  style={mod.active ? { backgroundColor: mod.color } : undefined}
                />
                <span className={`text-xs flex-1 font-mono ${mod.active ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                  {mod.label}
                </span>
                <span className={`text-xs font-mono ${mod.active ? 'text-muted-foreground/80' : 'text-muted-foreground/30'}`}>
                  {mod.value} {mod.unit}
                </span>
                <ArrowRight className="size-3 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="border-t border-b border-border py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-12 w-20" />
              <Skeleton className="h-2 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
