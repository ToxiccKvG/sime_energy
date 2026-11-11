// ============================================================
// Préférences d'affichage — taille du texte de toute la plateforme
//
// Demande du manager (12/10) : il a du mal à lire les écritures ; il
// veut agrandir les caractères de toute la plateforme, avec une taille
// maximale. On agit sur la taille de base (<html>) : tout ce qui est
// exprimé en rem (texte et espacements Tailwind) suit. Les textes des
// graphiques (SVG, en px) suivent via --ui-scale dans index.css.
//
// Stocké en localStorage comme les préférences de graphiques : réglage
// propre à la personne et au poste. Lecture et écriture protégées.
// ============================================================

import { useSyncExternalStore } from 'react';

export type TextSize = 'normal' | 'grand' | 'tres_grand';

export const TEXT_SIZES: { id: TextSize; label: string; scale: number }[] = [
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'grand', label: 'Grand', scale: 1.15 },
  { id: 'tres_grand', label: 'Très grand', scale: 1.3 }, // taille maximale
];

const STORAGE_KEY = 'sime-display-prefs-v1';

function load(): TextSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return TEXT_SIZES.some(s => s.id === v) ? (v as TextSize) : 'normal';
  } catch {
    return 'normal';
  }
}

function apply(size: TextSize) {
  const { scale } = TEXT_SIZES.find(s => s.id === size)!;
  const root = document.documentElement;
  root.style.fontSize = scale === 1 ? '' : `${scale * 100}%`;
  root.style.setProperty('--ui-scale', String(scale));
  root.dataset.textSize = size;
}

let state: TextSize = load();
apply(state); // dès l'import (main.tsx), avant le premier rendu : pas de saut visuel
const listeners = new Set<() => void>();

export function getTextSize(): TextSize { return state; }

export function setTextSize(size: TextSize) {
  state = size;
  apply(size);
  try { localStorage.setItem(STORAGE_KEY, size); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, getTextSize, getTextSize);
}
