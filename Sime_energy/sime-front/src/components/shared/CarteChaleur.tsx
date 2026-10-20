// ============================================================
// Carte de chaleur heure × jour — commune aux modules IOT et Mesures
//
// Remarque reçue le 20/10 : l'heure se lit en ORDONNÉE (0 h en bas,
// 23 h en haut, comme un axe) et les dates en ABSCISSE, EN BAS. Les
// étiquettes de dates s'espacent selon la largeur disponible pour ne
// plus s'entasser ; le détail de chaque case reste au survol.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { couleurSurEchelle } from '@/lib/chart-preferences';

export interface ColonneChaleur {
  /** Étiquette de l'axe (« 12 oct. », « Lun »). */
  libelle: string;
  /** Libellé du survol (« dim. 12 oct. 2026 »). */
  libelleComplet?: string;
  /** Jour de la colonne : sert à signaler le changement de mois sur l'axe. */
  date?: Date;
}

interface CarteChaleurProps {
  colonnes: ColonneChaleur[];
  /** valeurs[colonne][heure 0..23] ; null = pas de mesure. */
  valeurs: (number | null)[][];
  /** Teintes du dégradé, du plus faible au plus fort (stopsChaleur). */
  stops: string[];
  formatValeur: (v: number) => string;
  /** Case sans mesure. */
  couleurVide?: string;
  /** Classe des textes d'axe (thème du module). */
  classeTexte?: string;
}

const LARGEUR_ETIQUETTE = 46; // px nécessaires à « 12 oct. » sans chevauchement
const PAS_POSSIBLES = [1, 2, 3, 7, 14, 30, 61, 91];
const HEURES_HAUT_EN_BAS = Array.from({ length: 24 }, (_, i) => 23 - i);

export function CarteChaleur({
  colonnes, valeurs, stops, formatValeur,
  couleurVide = 'rgba(255,255,255,0.03)', classeTexte = 'text-slate-500',
}: CarteChaleurProps) {
  const boiteRef = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = boiteRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { vmin, vmax } = useMemo(() => {
    let vmin = Infinity, vmax = -Infinity;
    for (const col of valeurs) for (const v of col) if (v != null) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    return { vmin, vmax };
  }, [valeurs]);

  // Une étiquette toutes les `pas` colonnes, assez espacées pour la largeur réelle.
  const largeurCase = largeur > 0 ? (largeur - 40) / Math.max(1, colonnes.length) : LARGEUR_ETIQUETTE;
  const pas = PAS_POSSIBLES.find(p => p * largeurCase >= LARGEUR_ETIQUETTE) ?? PAS_POSSIBLES[PAS_POSSIBLES.length - 1];
  const etiquetee = (i: number) => i % pas === 0;

  if (!isFinite(vmin)) return null;

  const couleur = (v: number | null) => {
    if (v == null) return couleurVide;
    return couleurSurEchelle(stops, vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5);
  };
  const grille = { gridTemplateColumns: `2.5rem repeat(${colonnes.length}, minmax(4px, 1fr))` };

  return (
    <div className="space-y-2" ref={boiteRef}>
      <div className="overflow-x-auto pb-1">
        <div className="grid gap-px min-w-full" style={grille}>
          {HEURES_HAUT_EN_BAS.map(h => (
            <div key={h} className="contents">
              <div className={`text-[0.625rem] ${classeTexte} pr-1.5 text-right leading-4`}>
                {String(h).padStart(2, '0')}h
              </div>
              {colonnes.map((c, ci) => {
                const v = valeurs[ci]?.[h] ?? null;
                const quand = `${c.libelleComplet ?? c.libelle} ${String(h).padStart(2, '0')}h`;
                return (
                  <div key={ci} className="h-4 rounded-[2px]" style={{ backgroundColor: couleur(v) }}
                    title={v != null ? `${quand} — ${formatValeur(v)}` : `${quand} — pas de données`} />
                );
              })}
            </div>
          ))}
          {/* Abscisse, en bas : dates espacées, mois écrit à chaque changement */}
          <div />
          {colonnes.map((c, ci) => {
            const nouveauMois = c.date && ci > 0 && colonnes[ci - 1].date
              && colonnes[ci - 1].date!.getMonth() !== c.date.getMonth();
            const montrer = etiquetee(ci) || nouveauMois;
            return (
              <div key={ci} className="relative h-5">
                {montrer && (
                  <span className={`absolute left-0 top-1 text-[0.625rem] whitespace-nowrap ${classeTexte} ${nouveauMois ? 'font-medium' : ''}`}>
                    {c.libelle}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={`flex items-center gap-1.5 text-xs ${classeTexte}`}>
        {formatValeur(vmin)}
        <span className="inline-block h-2.5 w-28 rounded-full"
          style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
        {formatValeur(vmax)}
      </div>
    </div>
  );
}
