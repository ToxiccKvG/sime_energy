// ============================================================
// Carte de chaleur jour × heure — commune aux modules IOT et Mesures
//
// Consigne validée le 09/11 (brief du 06/11) : les HEURES en ABSCISSE
// (0 h à gauche, étiquettes en bas) pour aligner les mêmes heures d'un
// jour à l'autre, et les DATES en ORDONNÉE (la plus ancienne en haut).
// Sur une longue période les lignes s'affinent et les dates s'espacent ;
// le détail de chaque case reste au survol.
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

const HAUTEUR_ETIQUETTE = 13; // px nécessaires à une date sans chevauchement
const LARGEUR_HEURE = 26; // px nécessaires à « 00h » sans chevauchement
const PAS_POSSIBLES = [1, 2, 3, 7, 14, 30, 61, 91];
const HEURES = Array.from({ length: 24 }, (_, h) => h);

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

  // Lignes plus fines au-delà de deux mois, et une date toutes les `pas` lignes
  const hauteurLigne = colonnes.length <= 62 ? 16 : colonnes.length <= 186 ? 8 : 4;
  const pas = PAS_POSSIBLES.find(p => p * hauteurLigne >= HAUTEUR_ETIQUETTE) ?? PAS_POSSIBLES[PAS_POSSIBLES.length - 1];
  // Toutes les heures si la place le permet, sinon toutes les 3 h
  const largeurCase = largeur > 0 ? (largeur - 64) / 24 : LARGEUR_HEURE;
  const pasHeure = largeurCase >= LARGEUR_HEURE ? 1 : 3;

  if (!isFinite(vmin)) return null;

  const couleur = (v: number | null) => {
    if (v == null) return couleurVide;
    return couleurSurEchelle(stops, vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5);
  };
  const grille = { gridTemplateColumns: '4rem repeat(24, minmax(8px, 1fr))' };

  return (
    <div className="space-y-2" ref={boiteRef}>
      <div className="overflow-x-auto pb-1">
        <div className="grid gap-px min-w-full" style={grille}>
          {colonnes.map((c, ci) => {
            const nouveauMois = c.date && ci > 0 && colonnes[ci - 1].date
              && colonnes[ci - 1].date!.getMonth() !== c.date.getMonth();
            const montrer = ci % pas === 0 || nouveauMois;
            return (
              <div key={ci} className="contents">
                {/* Ordonnée : dates, mois écrit en gras à chaque changement */}
                <div className="relative" style={{ height: hauteurLigne }}>
                  {montrer && (
                    <span className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[0.625rem] leading-none whitespace-nowrap ${classeTexte} ${nouveauMois ? 'font-medium' : ''}`}>
                      {c.libelle}
                    </span>
                  )}
                </div>
                {HEURES.map(h => {
                  const v = valeurs[ci]?.[h] ?? null;
                  const quand = `${c.libelleComplet ?? c.libelle} ${String(h).padStart(2, '0')}h`;
                  return (
                    <div key={h} className="rounded-[2px]" style={{ height: hauteurLigne, backgroundColor: couleur(v) }}
                      title={v != null ? `${quand} — ${formatValeur(v)}` : `${quand} — pas de données`} />
                  );
                })}
              </div>
            );
          })}
          {/* Abscisse, en bas : heures de la journée */}
          <div />
          {HEURES.map(h => (
            <div key={h} className={`h-5 pt-1 text-center text-[0.625rem] ${classeTexte}`}>
              {h % pasHeure === 0 ? `${String(h).padStart(2, '0')}h` : ''}
            </div>
          ))}
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
