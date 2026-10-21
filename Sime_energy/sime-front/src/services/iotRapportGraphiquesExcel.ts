/**
 * Graphiques Excel natifs (modifiables) pour le rapport de la Courbe de charge.
 *
 * ExcelJS sait écrire des images mais pas des graphiques : on complète donc
 * le classeur qu'il produit avec les parties DrawingML (chart + drawing) qui
 * pointent sur les plages des feuilles « Journalier » et « Types de jour ».
 * Dans Excel, les graphiques restent liés aux cellules : couleurs, titres,
 * type de graphique et séries se modifient comme n'importe quel graphique.
 */

import JSZip from 'jszip';

export interface SerieExcel {
  /** Lettre de colonne des valeurs (ligne d'en-tête = nom de la série). */
  colonne: string;
  couleur: string;
}

export interface GraphiqueExcel {
  titre: string;
  feuille: string;
  ligneEntete: number;
  nbLignes: number;
  colonneCategories: string;
  barres: SerieExcel | null;
  courbes: SerieExcel[];
  /** Index (0-based) des points en clair : jours exclus des statistiques. */
  pointsClairs?: number[];
  formatCategories?: string;
  etiquettes?: boolean;
  /** Ancrage dans la feuille Graphiques (lignes, 0-based). */
  deLigne: number;
  aLigne: number;
}

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const T_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const T_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: string) => c.replace('#', '').toUpperCase();
const ref = (feuille: string, col: string, l1: number, l2?: number) =>
  esc(`'${feuille.replace(/'/g, "''")}'!$${col}$${l1}${l2 != null ? `:$${col}$${l2}` : ''}`);

function texteRiche(t: string, taille = 1200, gras = true) {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${taille}" b="${gras ? 1 : 0}"/></a:pPr>`
    + `<a:r><a:rPr lang="fr-FR" sz="${taille}" b="${gras ? 1 : 0}"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function chartXml(g: GraphiqueExcel): string {
  const l1 = g.ligneEntete + 1;
  const l2 = g.ligneEntete + g.nbLignes;
  const cat = `<c:cat><c:numRef><c:f>${ref(g.feuille, g.colonneCategories, l1, l2)}</c:f></c:numRef></c:cat>`;
  const catTexte = `<c:cat><c:strRef><c:f>${ref(g.feuille, g.colonneCategories, l1, l2)}</c:f></c:strRef></c:cat>`;
  const categories = g.formatCategories ? cat : catTexte;
  const nom = (s: SerieExcel) => `<c:tx><c:strRef><c:f>${ref(g.feuille, s.colonne, g.ligneEntete)}</c:f></c:strRef></c:tx>`;
  const valeurs = (s: SerieExcel) => `<c:val><c:numRef><c:f>${ref(g.feuille, s.colonne, l1, l2)}</c:f></c:numRef></c:val>`;
  let idx = 0;

  const barres = g.barres ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>`
    + `<c:ser><c:idx val="${idx}"/><c:order val="${idx++}"/>${nom(g.barres)}`
    + `<c:spPr><a:solidFill><a:srgbClr val="${hex(g.barres.couleur)}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`
    + (g.pointsClairs ?? []).map(i => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>`
      + `<c:spPr><a:solidFill><a:srgbClr val="${hex(g.barres!.couleur)}"><a:alpha val="35000"/></a:srgbClr></a:solidFill></c:spPr></c:dPt>`).join('')
    + (g.etiquettes ? '<c:dLbls><c:numFmt formatCode="#,##0.0" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' : '')
    + `${categories}${valeurs(g.barres)}</c:ser><c:gapWidth val="60"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>` : '';

  const courbes = g.courbes.length ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>`
    + g.courbes.map(s => `<c:ser><c:idx val="${idx}"/><c:order val="${idx++}"/>${nom(s)}`
      + `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${hex(s.couleur)}"/></a:solidFill><a:round/></a:ln></c:spPr>`
      + `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${hex(s.couleur)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
      + `${categories}${valeurs(s)}<c:smooth val="0"/></c:ser>`).join('')
    + `<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>` : '';

  const axeCat = `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>`
    + (g.formatCategories ? `<c:numFmt formatCode="${esc(g.formatCategories)}" sourceLinked="0"/>` : '')
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="5002"/><c:crosses val="autoZero"/>`
    + `<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const axeVal = `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>`
    + `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
    + `<c:title>${texteRiche('kWh', 1000, false)}<c:overlay val="0"/></c:title>`
    + `<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + `<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:lang val="fr-FR"/><c:roundedCorners val="0"/>`
    + `<c:chart><c:title>${texteRiche(g.titre)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    + `<c:plotArea><c:layout/>${barres}${courbes}${axeCat}${axeVal}</c:plotArea>`
    + `<c:legend><c:legendPos val="t"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
}

function ancre(g: GraphiqueExcel, i: number): string {
  return `<xdr:twoCellAnchor editAs="oneCell">`
    + `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.deLigne}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.aLigne}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(g.titre)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
    + `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="rIdGraphique${i + 1}"/></a:graphicData></a:graphic>`
    + `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/** Ajoute les graphiques natifs à la feuille `nomFeuille` du classeur `buffer`. */
export async function ajouterGraphiquesNatifs(buffer: ArrayBuffer, nomFeuille: string, graphiques: GraphiqueExcel[]): Promise<ArrayBuffer> {
  if (graphiques.length === 0) return buffer;
  const zip = await JSZip.loadAsync(buffer);

  // Fichier de la feuille cible, d'après workbook.xml et ses relations
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const rid = new RegExp(`<sheet [^>]*name="${esc(nomFeuille)}"[^>]*r:id="([^"]+)"`).exec(wbXml)?.[1];
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const cible = rid ? new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(wbRels)?.[1]
    ?? new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(wbRels)?.[1] : undefined;
  if (!cible) return buffer;
  const cheminFeuille = `xl/${cible.replace(/^\/?xl\//, '')}`;
  const nomFichier = cheminFeuille.split('/').pop()!;

  // Noms libres pour le dessin et les graphiques
  const libre = (prefixe: string) => { let n = 1; while (zip.file(`${prefixe}${n}.xml`)) n++; return n; };
  const nDessin = libre('xl/drawings/drawing');
  const nGraph = libre('xl/charts/chart');

  graphiques.forEach((g, i) => zip.file(`xl/charts/chart${nGraph + i}.xml`, chartXml(g)));
  zip.file(`xl/drawings/drawing${nDessin}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}" xmlns:r="${NS_R}">`
    + graphiques.map(ancre).join('') + `</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/drawing${nDessin}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG}">`
    + graphiques.map((_, i) => `<Relationship Id="rIdGraphique${i + 1}" Type="${T_CHART}" Target="../charts/chart${nGraph + i}.xml"/>`).join('')
    + `</Relationships>`);

  // Relation feuille → dessin, et balise <drawing> dans la feuille
  const cheminRels = cheminFeuille.replace(nomFichier, `_rels/${nomFichier}.rels`);
  const relDessin = `<Relationship Id="rIdDessinRapport" Type="${T_DRAWING}" Target="../drawings/drawing${nDessin}.xml"/>`;
  const relsExistantes = await zip.file(cheminRels)?.async('string');
  zip.file(cheminRels, relsExistantes
    ? relsExistantes.replace('</Relationships>', `${relDessin}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG}">${relDessin}</Relationships>`);
  let feuille = await zip.file(cheminFeuille)!.async('string');
  if (!feuille.includes(`xmlns:r="${NS_R}"`)) feuille = feuille.replace('<worksheet ', `<worksheet xmlns:r="${NS_R}" `);
  // <drawing> se place avant legacyDrawing / tableParts / extLst (ordre du schéma)
  const apres = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(feuille);
  const balise = '<drawing r:id="rIdDessinRapport"/>';
  feuille = apres ? feuille.slice(0, apres.index) + balise + feuille.slice(apres.index) : feuille.replace('</worksheet>', `${balise}</worksheet>`);
  zip.file(cheminFeuille, feuille);

  // Types de contenu
  let types = await zip.file('[Content_Types].xml')!.async('string');
  types = types.replace('</Types>',
    `<Override PartName="/xl/drawings/drawing${nDessin}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    + graphiques.map((_, i) => `<Override PartName="/xl/charts/chart${nGraph + i}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
    + '</Types>');
  zip.file('[Content_Types].xml', types);

  return zip.generateAsync({ type: 'arraybuffer' });
}
