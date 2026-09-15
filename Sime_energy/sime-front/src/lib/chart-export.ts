/**
 * Éléments à exclure d'une capture html2canvas d'un graphique Recharts :
 * l'infobulle, le trait de curseur et les points actifs laissés par le survol
 * de la souris au moment du clic sur « Exporter », plus tout élément marqué
 * `data-no-export` (boutons, sélecteurs).
 */
const HOVER_CLASSES = ['recharts-tooltip-wrapper', 'recharts-tooltip-cursor', 'recharts-active-dot'];

export function isHoverArtifact(el: Element): boolean {
  return HOVER_CLASSES.some((c) => el.classList.contains(c)) || el.hasAttribute('data-no-export');
}
