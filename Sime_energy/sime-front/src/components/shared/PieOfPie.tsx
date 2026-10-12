// ============================================================
// Camembert « principal + secondaire » générique (format Excel)
//
// Indépendant de la donnée : il reçoit des parts (nom, valeur, couleur) et
// une fonction de format. Sert à répartir n'importe quoi — énergie par
// appareil, durée par tranche de valeurs, coupures par cause, coûts de
// facturation… Les grosses parts portent des étiquettes encadrées ; les
// plus petites sont regroupées dans « Autres », détaillé dans un second
// camembert relié par des pointillés.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Cell, Customized, Pie, PieChart, Tooltip } from 'recharts';
import { useChartZoomed } from '@/components/shared/ChartZoom';

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

export const OTHERS_COLOR = '#94a3b8';
export const MAX_PARTS_CHOICES = [4, 5, 6, 8, 0] as const; // 0 = tout afficher

/**
 * Au-delà de `max` parts le camembert devient illisible : les plus petites sont
 * regroupées dans « Autres » (comme un camembert Excel), le détail restant
 * consultable. On garde max − 1 parts + « Autres » pour ne jamais dépasser `max`.
 */
export function groupSmallParts<T extends { name: string; value: number; color: string }>(rows: T[], max: number) {
  if (max <= 0 || rows.length <= max) return { shown: rows, others: [] as T[] };
  const keep = rows.slice(0, max - 1);
  const rest = rows.slice(max - 1);
  const grouped = { ...rest[0], name: `Autres (${rest.length})`, value: rest.reduce((a, r) => a + r.value, 0), color: OTHERS_COLOR };
  return { shown: [...keep, grouped], others: rest };
}

export type SliceLabelMode = 'percent' | 'value' | 'both';

/**
 * Camembert « principal + secondaire » (format Excel « camembert de camembert ») :
 * les grosses parts à gauche avec des étiquettes encadrées (nom + valeur ou %), et la part
 * « Autres » reliée par des pointillés à un second camembert qui en montre le détail.
 * Tout est dessiné en pixels (largeur mesurée) pour que les pointillés tombent juste.
 */
export type PieRow = { name: string; value: number; color: string };
const PIE_H = 380; // hauteur par défaut
const RAD = Math.PI / 180;


export type CalloutLayout = { ex: number; ey: number; ax: number; ay: number; right: boolean };

/**
 * Place les étiquettes d'un camembert : côté (gauche/droite) selon l'angle de la part, ou colonne
 * unique à droite (second camembert) ; puis espacement vertical minimal pour qu'elles ne se chevauchent pas.
 */
function layoutCallouts(rows: PieRow[], cx: number, cy: number, R: number, startAngle: number, forceRight: boolean, skip: number, height: number): (CalloutLayout | null)[] {
  const sum = rows.reduce((a, r) => a + r.value, 0) || 1;
  let ang = startAngle;
  const L = rows.map((r, i) => {
    const span = (r.value / sum) * 360, mid = ang - span / 2;
    ang -= span;
    const a = -mid * RAD;
    return { i, right: forceRight || Math.cos(a) >= 0, ex: cx + (R + 4) * Math.cos(a), ey: cy + (R + 4) * Math.sin(a), y: cy + (R + 26) * Math.sin(a) };
  });
  const out: (CalloutLayout | null)[] = rows.map(() => null);
  for (const side of [true, false]) {
    const g = L.filter((l) => l.right === side && l.i !== skip).sort((p, q) => p.y - q.y);
    for (let k = 1; k < g.length; k++) if (g[k].y - g[k - 1].y < 44) g[k].y = g[k - 1].y + 44;
    const over = g.length ? g[g.length - 1].y - (height - 22) : 0;
    for (const l of g) { if (over > 0) l.y -= over; l.y = Math.max(20, l.y); }
    for (const l of g) {
      out[l.i] = { ex: l.ex, ey: l.ey, ay: l.y, right: side, ax: forceRight ? cx + R + 44 : cx + (side ? R + 30 : -(R + 30)) };
    }
  }
  return out;
}

/**
 * Nom d'étiquette sur 1 ou 2 lignes (24 caractères max chacune) : sans parenthèse finale, coupé à un espace.
 * Les vrais noms d'appareils sont longs (« Congélateur Beko A+_224kWh/an ») : sur une seule ligne ils
 * débordent sur le second camembert. Le nom complet reste dans l'infobulle.
 */
const nameLines = (n: string): string[] => {
  const t = n.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (t.length <= 24) return [t];
  const cut = t.lastIndexOf(' ', 24);
  const first = t.slice(0, cut > 8 ? cut : 24);
  const rest = t.slice(first.length).trim();
  return [first, rest.length > 24 ? `${rest.slice(0, 23)}…` : rest];
};

export function PieOfPie({ shown, others, total, format, labelMode, showTooltip = true, height = PIE_H, onSliceClick, activeName, tooltipExtra }: {
  shown: PieRow[]; others: PieRow[]; total: number; format: (v: number) => string; labelMode: SliceLabelMode; showTooltip?: boolean;
  /** Hauteur du graphique en pixels (380 par défaut). */
  height?: number;
  /** Clic sur une part (hors « Autres », qui est un regroupement) : filtre croisé, détail… */
  onSliceClick?: (name: string) => void;
  /** Part sélectionnée : mise en évidence (ambre), les autres s'estompent. */
  activeName?: string | null;
  /** Contenu complémentaire de l'infobulle d'une part (appareils, nombre de points…). */
  tooltipExtra?: (name: string) => React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(720);
  // Hauteur libre sous le camembert jusqu'au bas de l'écran : sert à la vue agrandie seulement.
  const [availH, setAvailH] = useState(600);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      setAvail(Math.max(320, el.clientWidth));
      setAvailH(Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 40));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasSecond = others.length > 0;
  const othersTotal = others.reduce((a, r) => a + r.value, 0);
  const f = total > 0 ? othersTotal / total : 0;
  const pct = (v: number) => `${((v / total) * 100).toFixed(1).replace('.', ',')} %`;
  const line2Of = (v: number) => {
    const val = format(v), p = pct(v);
    return labelMode === 'percent' ? p : labelMode === 'value' ? val : `${val} · ${p}`;
  };
  const boxW = (name: string, v: number) => Math.max(...nameLines(name).map((l) => l.length * 6.2), line2Of(v).length * 5.6) + 12;

  // Largeur nécessaire : les étiquettes de gauche, les deux camemberts, la colonne de détail à droite.
  // Si l'écran est plus étroit, le graphique défile horizontalement plutôt que de couper du texte.
  const R = 90;
  const r2 = 62;
  const bwMain = Math.max(100, ...(hasSecond ? shown.slice(0, -1) : shown).map((d) => boxW(d.name, d.value)));
  const bwSec = Math.max(100, ...others.map((d) => boxW(d.name, d.value)));
  const cxMainMin = R + 34 + bwMain;
  // Entre les deux camemberts : les étiquettes de droite du principal (largeur bwMain) ne doivent pas toucher le second.
  const gapMain = R + 30 + bwMain + 24 + r2;
  const required = hasSecond ? cxMainMin + gapMain + r2 + 52 + bwSec : 2 * (R + 34 + bwMain);
  // Vue agrandie (ChartZoom) : le dessin garde sa taille naturelle et GROSSIT jusqu'à ×1,8,
  // dans la limite de la hauteur d'écran ; ailleurs il ne fait que rétrécir si la place manque.
  const zoomed = useChartZoomed();
  const w = zoomed ? Math.max(required, 640) : Math.max(avail, required);
  const scale = zoomed
    ? Math.max(0.55, Math.min(1.8, avail / w, availH / height))
    : Math.max(0.55, Math.min(1, avail / w));
  const cy = height / 2;
  const cxMain = hasSecond ? Math.max(cxMainMin, w * 0.27) : w / 2;
  const cxSec = Math.max(cxMain + gapMain, Math.min(w * 0.66, w - r2 - 52 - bwSec));
  // « Autres » est la dernière part : on tourne le camembert pour qu'elle regarde le second (à droite, 0°).
  const startAngle = hasSecond ? 360 - 180 * f : 90;
  const endAngle = startAngle - 360;
  const theta = 180 * f * RAD;

  const layMain = useMemo(() => layoutCallouts(shown, cxMain, cy, R, startAngle, false, hasSecond ? shown.length - 1 : -1, height), [shown, cxMain, cy, R, startAngle, hasSecond, height]);
  const laySec = useMemo(() => layoutCallouts(others, cxSec, cy, r2, 90, true, -1, height), [others, cxSec, cy, r2, height]);

  /** Étiquette encadrée avec ligne de rappel : nom (couleur de la part) puis valeur et/ou %. */
  const callout = (lay: (CalloutLayout | null)[]) => (d: any) => {
    const l = lay[d.index];
    if (!l) return null; // « Autres » : décrit sous le second camembert
    const line2 = line2Of(Number(d.value));
    const nl = nameLines(String(d.name));
    const bw = boxW(String(d.name), Number(d.value)), bh = 10 + (nl.length + 1) * 12.5;
    const bx = l.right ? l.ax : l.ax - bw, by = l.ay - bh / 2;
    return (
      <g>
        <polyline points={`${l.ex},${l.ey} ${l.ax},${l.ay}`} fill="none" stroke={d.fill} strokeDasharray="2 2" />
        <rect x={bx} y={by} width={bw} height={bh} rx={3} fill="hsl(var(--background))" stroke={d.fill} strokeDasharray="3 2" />
        {nl.map((t, i) => (
          <text key={i} x={bx + bw / 2} y={by + 14 + i * 12.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={d.fill}>{t}</text>
        ))}
        <text x={bx + bw / 2} y={by + 14 + nl.length * 12.5} textAnchor="middle" fontSize={10} fill="hsl(var(--foreground))">{line2}</text>
      </g>
    );
  };

  const connectors = () => hasSecond ? (
    <g stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" strokeWidth={1}>
      <line x1={cxMain + R * Math.cos(theta)} y1={cy - R * Math.sin(theta)} x2={cxSec} y2={cy - r2} />
      <line x1={cxMain + R * Math.cos(theta)} y1={cy + R * Math.sin(theta)} x2={cxSec} y2={cy + r2} />
    </g>
  ) : null;

  const tipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <div style={tooltipStyle} className="px-3 py-2 text-xs space-y-1 max-w-[280px]">
        <p className="font-semibold">{String(p.name)}</p>
        <p>{format(Number(p.value))} · {pct(Number(p.value))}</p>
        {tooltipExtra?.(String(p.name))}
      </div>
    );
  };
  const clickable = !!onSliceClick;
  const handleClick = (entry: any) => {
    const n = String(entry?.name ?? '');
    if (n && !(hasSecond && n === shown[shown.length - 1]?.name)) onSliceClick?.(n);
  };
  const fillOf = (d: PieRow) => (activeName && d.name === activeName ? '#f59e0b' : d.color);
  const opacityOf = (d: PieRow) => (activeName && d.name !== activeName ? 0.35 : 1);

  return (
    <div ref={boxRef} className="w-full max-w-full min-w-0" style={{ contain: 'inline-size' }}>
      {/* Le graphique est dessiné à sa largeur naturelle `w`, puis RÉDUIT pour tenir dans la largeur disponible
          (jamais coupé). Sous 55 % de réduction, il défile plutôt que de devenir illisible. */}
      <div style={{ width: '100%', height: height * scale, overflowX: scale > avail / w + 0.001 ? 'auto' : 'hidden', overflowY: 'hidden' }}>
        <div style={{ width: w, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <PieChart width={w} height={height} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        {showTooltip && <Tooltip content={tipContent} />}
        <Pie data={shown} dataKey="value" nameKey="name" cx={cxMain} cy={cy} outerRadius={R} innerRadius={0}
          startAngle={startAngle} endAngle={endAngle} isAnimationActive={false} stroke="hsl(var(--background))"
          label={callout(layMain)} labelLine={false} onClick={clickable ? handleClick : undefined}>
          {shown.map((d) => <Cell key={d.name} fill={fillOf(d)} opacity={opacityOf(d)} cursor={clickable ? 'pointer' : undefined} />)}
        </Pie>
        {hasSecond && (
          <Pie data={others} dataKey="value" nameKey="name" cx={cxSec} cy={cy} outerRadius={r2} innerRadius={0}
            startAngle={90} endAngle={-270} isAnimationActive={false} stroke="hsl(var(--background))"
            label={callout(laySec)} labelLine={false} onClick={clickable ? handleClick : undefined}>
            {others.map((d) => <Cell key={d.name} fill={fillOf(d)} opacity={opacityOf(d)} cursor={clickable ? 'pointer' : undefined} />)}
          </Pie>
        )}
        <Customized component={connectors} />
      </PieChart>
        </div>
      </div>
      {hasSecond && (
        <p className="text-xs text-center text-muted-foreground -mt-2">
          Détail de la part « Autres » ({others.length} éléments) : {format(othersTotal)} · {pct(othersTotal)} du total
        </p>
      )}
    </div>
  );
}


