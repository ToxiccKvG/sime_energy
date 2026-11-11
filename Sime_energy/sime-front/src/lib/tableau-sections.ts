// ============================================================
// Tableaux « empilés » → une colonne par série (IOT et Mesures)
//
// Principe (19/10) : une valeur appartient à la série que désigne sa
// section ou sa colonne. Certains exports empilent les séries les unes
// sous les autres, chacune sous un titre et un en-tête répété :
//
//    Phase A            ← titre de section (une seule cellule)
//    Temps, Wh          ← en-tête répété
//    01/09/2025, 4089   ← données
//    Phase B
//    Temps, Wh
//    …
//    Retour Total
//    Temps, Wh
//
// Lu tel quel, tout se retrouve dans la même colonne « Wh » : les phases,
// le total et les retours s'additionnent (export Shelly Cloud « villas » :
// 138 kWh au lieu de 69). On réorganise donc en une ligne par horodatage
// et une colonne par section : Temps | Phase A (Wh) | … | Retour Total (Wh).
// ============================================================

const vide = (v: unknown) => v === null || v === undefined || String(v).replace(/[\uFEFF\u200B]/g, '').trim() === '';
const texte = (v: unknown) => String(v ?? '').replace(/[\uFEFF\u200B]/g, '').trim();
const estNombre = (v: unknown) => typeof v === 'number' || /^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/.test(texte(v).replace(/[ \u00a0]/g, ''));
const estDate = (v: unknown) => v instanceof Date || /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(texte(v));

function pleines(r: unknown[]): unknown[] { return r.filter(c => !vide(c)); }

/** Titre de section : une seule cellule, du texte (ni nombre ni date). */
function estTitre(r: unknown[]): boolean {
  const p = pleines(r);
  return p.length === 1 && !estNombre(p[0]) && !estDate(p[0]);
}

/** Titre absent de la 1re section (avalé comme préambule) : « Phase B » ensuite → « Phase A ». */
function titrePrecedent(suivant: string): string | null {
  const m = suivant.match(/^(.*?)([B2])$/i);
  if (!m) return null;
  return m[1] + (m[2] === '2' ? '1' : m[2] === 'b' ? 'a' : 'A');
}

export interface Desempilement {
  rows: unknown[][];
  sections: string[];
}

/**
 * Renvoie le tableau réorganisé si `brut` empile au moins deux sections
 * sous un même en-tête répété ; sinon null (le tableau est laissé tel quel).
 */
export function desempilerSections(brut: unknown[][]): Desempilement | null {
  const lignes = brut.filter(r => Array.isArray(r) && pleines(r).length > 0);
  // En-tête répété : la même 1re cellule texte revient au moins deux fois, suivie de données
  const compte = new Map<string, number>();
  for (let i = 0; i + 1 < lignes.length; i++) {
    const r = lignes[i];
    if (estTitre(r) || !pleines(r).every(c => !estNombre(c) && !estDate(c))) continue;
    if (!estDate(lignes[i + 1][0])) continue;
    const cle = texte(r[0]).toLowerCase();
    if (cle) compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  const [cleEntete, nbEntetes] = [...compte.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (nbEntetes < 2) return null;
  const nbTitres = lignes.filter(estTitre).length;
  if (nbTitres < 1) return null;

  type Section = { titre: string | null; entete: string[]; lignes: unknown[][] };
  const sections: Section[] = [];
  let titre: string | null = null;
  let cur: Section | null = null;
  for (const r of lignes) {
    if (estTitre(r)) { titre = texte(pleines(r)[0]); cur = null; continue; }
    if (texte(r[0]).toLowerCase() === cleEntete) {
      cur = { titre, entete: r.map(texte), lignes: [] };
      sections.push(cur);
      titre = null;
      continue;
    }
    if (cur && estDate(r[0])) cur.lignes.push(r);
  }
  if (sections.length < 2) return null;
  // 1re section sans titre (avalé comme préambule par le lecteur CSV)
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].titre) continue;
    const suivant = sections.slice(i + 1).find(s => s.titre)?.titre;
    sections[i].titre = (suivant && titrePrecedent(suivant)) || (i === 0 ? 'Valeurs' : `Section ${i + 1}`);
  }

  const colTemps = sections[0].entete[0] || 'Temps';
  const colonnes: string[] = [colTemps];
  const parTs = new Map<string, unknown[]>();
  const ordre: string[] = [];
  for (const s of sections) {
    const valeurs = s.entete.slice(1).map((v, k) => ({ nom: v, k: k + 1 })).filter(v => v.nom !== '' || s.lignes.some(l => !vide(l[v.k])));
    for (const v of valeurs) {
      const nom = valeurs.length === 1
        ? (v.nom ? `${s.titre} (${v.nom})` : s.titre!)
        : `${s.titre} — ${v.nom || `col ${v.k}`}`;
      const idx = colonnes.length;
      colonnes.push(nom);
      for (const l of s.lignes) {
        const cle = l[0] instanceof Date ? l[0].toISOString() : texte(l[0]);
        let ligne = parTs.get(cle);
        if (!ligne) { ligne = [l[0]]; parTs.set(cle, ligne); ordre.push(cle); }
        ligne[idx] = l[v.k] ?? null;
      }
    }
  }
  const rows = [colonnes, ...ordre.map(k => colonnes.map((_, i) => parTs.get(k)![i] ?? null))];
  return { rows, sections: sections.map(s => s.titre!) };
}
