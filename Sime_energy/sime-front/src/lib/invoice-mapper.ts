import type { InvoiceData } from '@/types/billing'
import type { FactureSenelecForSelector } from '@/lib/factures-senelec-service'

// ─── Types internes ───────────────────────────────────────────────────────────

type KVPair = { Key: string; Value: string }
type Cell   = { text: string }

// ─── Extraction forms + tables depuis ocr_data ────────────────────────────────
// Structure DB : { page: [{ forms: [{Key,Value}], tables: [{rows:[[{text}]]}] }] }
//            ou : { pages: [...] }   (multi-pages, Textract batch)

function extractFormsAndTables(ocr_data: unknown): {
  forms:  KVPair[]
  tables: Cell[][][]
} {
  if (!ocr_data || typeof ocr_data !== 'object') return { forms: [], tables: [] }
  const d = ocr_data as Record<string, unknown>

  const pageArr =
    (Array.isArray(d.pages) ? d.pages :
     Array.isArray(d.page)  ? d.page  : null) as Array<Record<string, unknown>> | null

  if (pageArr && pageArr.length > 0) {
    const p = pageArr[0]
    return {
      forms:  Array.isArray(p.forms)  ? (p.forms  as KVPair[])  : [],
      tables: Array.isArray(p.tables) ? extractTables(p.tables) : [],
    }
  }

  return {
    forms:  Array.isArray(d.forms)  ? (d.forms  as KVPair[])  : [],
    tables: Array.isArray(d.tables) ? extractTables(d.tables) : [],
  }
}

function extractTables(raw: unknown[]): Cell[][][] {
  return raw
    .map(t => {
      if (!t || typeof t !== 'object') return null
      const tbl = t as Record<string, unknown>
      if (!Array.isArray(tbl.rows)) return null
      return (tbl.rows as unknown[][]).map(row =>
        (Array.isArray(row) ? row : []).map(cell => {
          if (!cell || typeof cell !== 'object') return { text: '' }
          return { text: String((cell as Record<string, unknown>).text ?? '') }
        })
      )
    })
    .filter(Boolean) as Cell[][][]
}

// ─── Dictionnaire unifié forms + tables génériques ────────────────────────────
//
// Stratégie :
//   1. Toutes les paires forms {Key, Value} entrent directement (priorité maximale).
//   2. Pour chaque table, on analyse chaque ligne :
//      - 2 cellules non vides → clé = col 0, valeur = col 1
//      - 3+ cellules → clé = col 0, valeur = dernière cellule non vide
//   3. Les forms ont la priorité absolue sur les tables (pas d'écrasement).
//
// NOTE : ce dictionnaire capture uniquement la dernière colonne de chaque ligne.
//        Les colonnes intermédiaires (QUANTITE, TARIF) sont extraites par les
//        extracteurs dédiés (extractBillingTable4Col, extractEnergyMatrix).

function buildLookup(forms: KVPair[], tables: Cell[][][]): Map<string, string> {
  const map = new Map<string, string>()

  for (const { Key, Value } of forms) {
    if (Key && Value) map.set(normKey(Key), Value.trim())
  }

  for (const rows of tables) {
    for (const row of rows) {
      const cells = row.map(c => c.text.trim()).filter(Boolean)

      if (cells.length === 2) {
        const k = normKey(cells[0])
        if (k && !map.has(k)) map.set(k, cells[1])
      } else if (cells.length >= 3) {
        const k = normKey(cells[0])
        const v = cells[cells.length - 1]
        if (k && v && !map.has(k)) map.set(k, v)
      }
    }
  }

  return map
}

// ─── Normalisations ───────────────────────────────────────────────────────────

/** Normalisation clés OCR — préserve les accents (utilisé pour buildLookup) */
function normKey(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\s*:\s*$/, '')
    .replace(/[°º()[\],.%²¹³'"`/]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalisation accent-insensitive NFD (utilisé pour les extracteurs dédiés) */
function normAccent(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // accents composés (é → e)
    // Lettres modificatrices Unicode — superscripts OCR comme ᵐᵉ (U+1D50, U+1D49)
    // présents dans "2èᵐᵉ tranche" / "3èᵐᵉ tranche" sur factures SENELEC
    .replace(/[\u02B0-\u02FF\u1D00-\u1DBF]/g, '')
    .replace(/[°º()[\],.%²¹³'"`/_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Parseurs ─────────────────────────────────────────────────────────────────

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d
}

function diffDays(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/** Parse un montant FCFA — conserve le signe négatif (bonification cosφ) */
function parseXOF(raw: string | undefined | null): number {
  if (!raw) return 0
  const isNeg = raw.includes('-')
  const cleaned = raw.replace(/[^\d\s,.]/g, ' ').trim()
  if (!cleaned) return 0
  const noSpaces   = cleaned.replace(/\s+/g, '')
  const normalized = noSpaces.replace(',', '.')
  const n = parseFloat(normalized)
  if (!isFinite(n) || n === 0) return 0
  return isNeg ? -n : n
}

/** Retourne null si la cellule est vide ou zéro */
function parseXOFOrNull(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null
  const n = parseXOF(raw)
  return n !== 0 ? n : null
}

function lookup(map: Map<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const v = map.get(normKey(alias))
    if (v) return v
  }
  return null
}

// ─── Extraction tranches BT (DPP/DMP/PPP/PMP) ────────────────────────────────
//
// Tableau OCR : Tranches | Conso (kWh) | Tarif (FCFA/kWh) | Montant (FCFA)
//   1ère tranche |  80   |   165       |   13 200
//   2ème tranche | 320   |   191,01    |   61 123
//   3ème tranche | 496   |   210,81    |  104 562

interface TrancheRow { kwh: number; tarif: number; montant: number }

function trancheNum(raw: string): number | null {
  const n = normAccent(raw)
  // "1ère tranche", "1ème", "1ere", "2eme tranche", "2e tranche" (après strip superscripts), etc.
  // "e" seul : résultat de normAccent("2èᵐᵉ") → "2e" (ᵐᵉ strippé, è→e)
  const m1 = n.match(/^([123])\s*(e|ere?|eme?|ieme?)\s*(tranche)?$/)
  if (m1) return parseInt(m1[1])
  // "1 tranche", "2 tranche" (sans suffixe ordinal)
  const m2 = n.match(/^([123])\s+tranche$/)
  if (m2) return parseInt(m2[1])
  // "tranche 1", "tranche 2", "tranche 3"
  const m3 = n.match(/^tranche\s+([123])$/)
  if (m3) return parseInt(m3[1])
  // Chiffre seul "1", "2", "3" — faux positifs filtrés par la vérification nums.length < 2
  const m4 = n.match(/^([123])$/)
  if (m4) return parseInt(m4[1])
  return null
}

function extractTranches(tables: Cell[][][]): {
  t1?: TrancheRow; t2?: TrancheRow; t3?: TrancheRow
} {
  const result: { t1?: TrancheRow; t2?: TrancheRow; t3?: TrancheRow } = {}

  for (const rows of tables) {
    for (const row of rows) {
      const cells = row.map(c => c.text.trim()).filter((_, i) => i < 5)
      if (cells.length < 3) continue

      const num = trancheNum(cells[0])
      if (!num) continue

      const nums = cells.slice(1).map(s => parseXOF(s)).filter(n => n > 0)
      if (nums.length < 2) continue

      let kwh = 0, tarif = 0, montant = 0
      if (nums.length >= 3) {
        ;[kwh, tarif, montant] = nums
      } else {
        ;[kwh, montant] = nums
        tarif = kwh > 0 ? montant / kwh : 0
      }

      const row_data: TrancheRow = { kwh, tarif, montant }
      if (num === 1) result.t1 = row_data
      else if (num === 2) result.t2 = row_data
      else if (num === 3) result.t3 = row_data
    }
  }

  return result
}

// ─── Extraction tableau de facturation 4 colonnes (GP/MT) ────────────────────
//
// Structure SENELEC Grande Puissance / Moyenne Tension :
//
//   DESIGNATION              | QUANTITE    | TARIF/TAUX | MONTANT
//   Montant Energie K1       | 52 382 kWh  |  90,41     | 4 735 857
//   Montant Energie K2       | 103 936 kWh | 144,65     | 15 034 342
//   Prime Fixe Mensuelle     |             |  4 093,6   |    697 959
//   Pénalité sur dépassement |             |  4 093,6   |     38 070
//   Application Cos phi      | 20 506 228  |   2,25 %   |   -461 390   ← négatif = bonification
//   Taxe Communale           |             |            |          —
//   Redevance                |             | 15 850     |     16 378
//   Montant Total HT         |             |            | 20 061 216
//   Montant TVA              | 20 061 216  |    18 %    |  3 611 019
//   Total Facture            |             |            | 23 672 228
//   Montant Total TTC        |             |            | 23 672 200

interface BillingLine {
  label:    string        // normAccent() du libellé — utilisé pour la recherche
  quantite: number | null // col[1] : kWh facturés ou kVarh ou base de calcul
  tarif:    number | null // col[2] : FCFA/kWh, FCFA/kW/mois, ou %
  montant:  number | null // col[last] : FCFA — peut être négatif (bonification)
}

function isBillingTable4Col(rows: Cell[][]): boolean {
  return rows.some(row => {
    const lbl = normAccent(row[0]?.text ?? '')
    return (
      lbl.includes('energie k1') ||
      lbl.includes('energie k2') ||
      lbl.includes('prime fixe') ||
      (lbl.includes('total') && lbl.includes('ht')) ||
      (lbl.includes('total') && lbl.includes('ttc'))
    )
  })
}

function extractBillingTable4Col(tables: Cell[][][]): BillingLine[] {
  for (const rows of tables) {
    if (!isBillingTable4Col(rows)) continue

    const lines: BillingLine[] = []
    for (const row of rows) {
      const cells = row.map(c => c.text.trim())
      if (!cells[0] || cells.length < 2) continue

      const label = normAccent(cells[0])

      let quantite: number | null = null
      let tarif:    number | null = null
      let montant:  number | null = null

      if (cells.length >= 4) {
        // Tableau complet 4 colonnes : DESIGNATION | QUANTITE | TARIF | MONTANT
        quantite = parseXOFOrNull(cells[1])
        tarif    = parseXOFOrNull(cells[2])
        montant  = parseXOFOrNull(cells[3])
      } else if (cells.length === 3) {
        // Tableau 3 colonnes : DESIGNATION | TARIF | MONTANT
        tarif   = parseXOFOrNull(cells[1])
        montant = parseXOFOrNull(cells[2])
      } else {
        // Tableau 2 colonnes : DESIGNATION | MONTANT
        montant = parseXOFOrNull(cells[1])
      }

      lines.push({ label, quantite, tarif, montant })
    }
    return lines // premier tableau correspondant trouvé
  }
  return []
}

/**
 * Trouve la première ligne de facturation dont le label normalisé
 * contient TOUS les mots-clés donnés (accent-insensitive).
 */
function findBillingLine(lines: BillingLine[], ...keywords: string[]): BillingLine | null {
  const kws = keywords.map(k => normAccent(k))
  return lines.find(l => kws.every(kw => l.label.includes(kw))) ?? null
}

// ─── Extraction matrice énergie K1/K2 (GP/MT) ────────────────────────────────
//
// Tableau multi-colonnes SENELEC Grande Puissance :
//
//   (entête fusionné) | Energie Active (kWh)  |  Energie   |  Heures   | Heures
//                     |  K1    | K2  | Total  | réactive   |  transfo  | cond.
//                     |        |     |        |  (kVarh)   |    H1     |  H2
//   Nouvel Index      | 191 996|113 447|      |  107 407   |     0     |
//   Ancien Index      | 140 446| 11 162|      |   79 363   |     0     |
//   Consommation      |  51 550|102 285| 153 835|  28 044  |   744     |
//   Majoration        |    832 |  1 651|  2 483|   5 028   |           |
//   Rappels           |      0 |      0|      0|           |           |
//   Total à facturer  |  52 382|103 936| 156 318|  33 072  |           |
//
// Stratégie : identifier les lignes par leur libellé de première colonne,
// puis extraire les valeurs numériques dans l'ordre des colonnes connues.

interface EnergyMatrix {
  conso_k1?:          number  // kWh — consommation nette K1 (avant majorations)
  conso_k2?:          number  // kWh — consommation nette K2 (avant majorations)
  conso_total?:       number  // kWh — consommation nette totale
  conso_reactive?:    number  // kVarh — énergie réactive
  conso_h1?:          number  // h — heures transformateur H1
  total_fact_k1?:     number  // kWh — total à facturer K1 (conso + majorations - rappels)
  total_fact_k2?:     number  // kWh — total à facturer K2
  total_fact_total?:  number  // kWh — total à facturer global
  majoration_k1?:     number  // kWh — majorations K1
  majoration_k2?:     number  // kWh — majorations K2
}

function isBillingEnergyMatrix(rows: Cell[][]): boolean {
  return rows.some(row => {
    if (row.length < 4) return false
    const lbl = normAccent(row[0]?.text ?? '')
    return (
      lbl === 'consommation' ||
      lbl.startsWith('consommation') ||
      (lbl.includes('total') && lbl.includes('facturer'))
    )
  })
}

function extractEnergyMatrix(tables: Cell[][][]): EnergyMatrix {
  for (const rows of tables) {
    if (!isBillingEnergyMatrix(rows)) continue

    const result: EnergyMatrix = {}

    for (const row of rows) {
      const cells = row.map(c => c.text.trim())
      if (cells.length < 3 || !cells[0]) continue

      const lbl = normAccent(cells[0])

      // Extraire les valeurs numériques positives par position (null si vide/zéro)
      const nums = cells.slice(1).map(s => {
        const n = parseXOF(s)
        return n > 0 ? n : null
      })

      if (lbl === 'consommation' || lbl.startsWith('consommation')) {
        // Ordre : K1 | K2 | Total | Réactive | H1 | H2
        result.conso_k1       = nums[0] ?? undefined
        result.conso_k2       = nums[1] ?? undefined
        result.conso_total    = nums[2] ?? undefined
        result.conso_reactive = nums[3] ?? undefined
        result.conso_h1       = nums[4] ?? undefined
      } else if (lbl.includes('total') && lbl.includes('facturer')) {
        // Ordre : K1 | K2 | Total | Réactive
        result.total_fact_k1    = nums[0] ?? undefined
        result.total_fact_k2    = nums[1] ?? undefined
        result.total_fact_total = nums[2] ?? undefined
      } else if (lbl.startsWith('majoration')) {
        // Ordre : K1 | K2 | Total
        result.majoration_k1 = nums[0] ?? undefined
        result.majoration_k2 = nums[1] ?? undefined
      }
    }

    return result
  }
  return {}
}

// ─── Mapping principal ────────────────────────────────────────────────────────
//
// Priorité par source pour chaque champ :
//   1. billing4col (tableau facturation 4 col) — montants, tarifs, quantités K1/K2
//      ⚠ Textract key-value (forms) concatène TOUTE la ligne (QUANTITE+TARIF+MONTANT)
//        dans la valeur → parseXOF donne des valeurs aberrantes → JAMAIS prioritaire
//        pour les champs issus du tableau de facturation.
//   2. energyMatrix (matrice K1/K2/Total) — consommations nettes, réactive, H1
//   3. forms (Textract key-value) — UNIQUEMENT pour les champs d'entête technique
//      (Pmax, PS, cosφ mesuré, Dépassement kW, Nj, dates) qui ne figurent PAS dans
//      le tableau de facturation 4 colonnes.

export function mapOcrToInvoiceData(ocr_data: unknown, amount_ttc_db?: number): Partial<InvoiceData> {
  const { forms, tables } = extractFormsAndTables(ocr_data)
  const dict    = buildLookup(forms, tables)
  const tranches = extractTranches(tables)
  const billing  = extractBillingTable4Col(tables)
  const energy   = extractEnergyMatrix(tables)

  const raw = (aliases: string[]) => lookup(dict, aliases)

  // ── Repérer les lignes du tableau de facturation ──────────────────────────
  const k1Line     = findBillingLine(billing, 'energie', 'k1')
  const k2Line     = findBillingLine(billing, 'energie', 'k2')
  const pfLine     = findBillingLine(billing, 'prime', 'fixe')
  const pdpLine    = findBillingLine(billing, 'penalite', 'depassement')
               ?? findBillingLine(billing, 'depassement', 'puissance')
  const cosphiLine = findBillingLine(billing, 'application', 'cos')
               ?? findBillingLine(billing, 'cos', 'phi')
               ?? findBillingLine(billing, 'cosphi')
  const tcoLine    = findBillingLine(billing, 'taxe', 'communale')
               ?? findBillingLine(billing, 'tco')
  const redevLine  = findBillingLine(billing, 'redevance')
  const tvaLine    = findBillingLine(billing, 'tva')
  const htLine     = findBillingLine(billing, 'total', 'ht')
  const totalLine  = findBillingLine(billing, 'total', 'facture')
  const ttcLine    = findBillingLine(billing, 'total', 'ttc')

  // ── Lookups forms/dict ───────────────────────────────────────────────────
  //
  // RÈGLE : raw() est valide uniquement quand la valeur OCR contient UN SEUL nombre.
  //
  // Cas problématique (GP/MT, 4 col) : Textract concatène toute la ligne →
  //   "Montant Energie K1" → "5 499 90,41 497 165" (QUANTITE+TARIF+MONTANT mélangés)
  //   → parseXOF donne une valeur aberrante
  //   → ces champs viennent EXCLUSIVEMENT de extractBillingTable4Col()
  //
  // Cas sûr (BT, 2 col) : chaque ligne = 1 libellé + 1 montant seul
  //   "MONTANT CONSOMMATION" → "178 885" (1 valeur) → parseXOF correct
  //   → ces champs utilisent raw() comme fallback (billing4col est vide pour BT)
  //
  // Signal BT : billing.length === 0 (isBillingTable4Col ne reconnaît pas les tables BT)
  const isBT = billing.length === 0

  // Entête technique (toujours 1 seule valeur → raw() toujours valide)
  const conso_str = raw([
    'CONSOMMATION (KWH)', 'CONSOMMATION KWH', 'CONSOMMATION', 'CONSO KWH', 'ENERGIE CONSOMMEE',
  ])
  const total_fac_str = raw([
    'TOTAL FACTURE', 'Total Facture', 'MONTANT FACTURE', 'TOTAL FACTURE (1)', 'Montant Facture',
  ])
  const ttc_str = raw([
    'MONTANT TOTAL TTC', 'MONTANT TTC', 'NET A PAYER', 'TOTAL NET A PAYER',
  ])
  // TOTAL DES SOMMES DUES (1)+(2) = montant courant + arriérés — meilleure approximation
  // si le tableau de facturation ne contient pas de ligne "Total Facture"
  // ⚠ NE PAS utiliser pour les KPIs (fausse IPR) — uniquement comme fallback d'affichage
  const total_sommes_dues_str = raw([
    'TOTAL DES SOMMES DUES', 'TOTAL SOMMES DUES', 'TOTAL_SOMMES_DUES',
  ])
  const pmax_str   = raw(['Pmax relevée', 'PUISSANCE MAX', 'PUISSANCE ATTEINTE', 'PMAX', 'PUISSANCE MAXIMALE'])
  const depass_str = raw(['Dépassement', 'DEPASSEMENT', 'DEPASSEMENT KW'])
  const cosphi_str = raw(['Cosinus phi', 'COSPHI', 'FACTEUR DE PUISSANCE', 'COS PHI', 'COSINUS PHI'])
  const k1_form_str = raw(['HEURES HORS POINTE', 'CONSO HHP', 'K1 KWH', 'HHP'])
  const k2_form_str = raw(['HEURES POINTE', 'CONSO HP', 'K2 KWH', 'HP', 'HEURES DE POINTE'])
  const nj_str         = raw(['Nombre de jours', 'NOMBRE DE JOURS', 'NJ', 'Durée periode', 'Nb jours', 'Jours'])
  const date_debut_str = raw(['Date début période', 'Date de début', 'Début période', 'Du', 'Date début'])
  const date_fin_str   = raw(['Date fin période', 'Date de fin', 'Fin période', 'Au', 'Date fin'])

  // ── Champs contractuels entête ────────────────────────────────────────────
  const type_abonnement_str = raw([
    'Type Abonnement', 'TYPE ABONNEMENT', 'CATEGORIE TARIFAIRE', 'Catégorie',
    'TYPE TARIF TEXTE', 'TYPE CLIENT', 'ABONNEMENT', 'CATEGORIE', 'Type de contrat',
    'TYPE DE CONTRAT', 'TYPE TARIF', 'Type tarif',
  ])
  const domaine_tension_str = raw([
    'Type de branchement', 'TYPE DE BRANCHEMENT', 'DOMAINE TENSION', 'TENSION NOMINALE',
    'Domaine', 'TENSION', 'DOMAINE DE TENSION', 'Niveau de tension',
  ])
  const ps_form_str = raw([
    'PUISSANCE SOUSCRITE (kW)', 'PUISSANCE SOUSCRITE', 'PS (kW)',
    'PUISSANCE CONTRACTUELLE', 'PS', 'Puissance souscrite',
  ])
  const ps_raw_val = parseXOF(ps_form_str)
  const puissance_souscrite_kw = ps_raw_val > 0
    ? (ps_raw_val > 10000 ? ps_raw_val / 1000 : ps_raw_val)
    : undefined

  // Fallbacks BT uniquement (table 2-col — 1 valeur par ligne, pas de concatenation)
  const bt_conso_str = isBT ? raw(['MONTANT CONSOMMATION', 'Montant Consommation', 'MONTANT_TOTAL_ENERGIE']) : null
  const bt_pf_str    = isBT ? raw(['PRIME FIXE MENSUELLE', 'Prime Fixe Mensuelle', 'PRIME FIXE', 'MONTANT_PRIME_FIXE']) : null
  const bt_pdp_str   = isBT ? raw(['PENALITE SUR DEPASSEMENT', 'Pénalité sur dépassement', 'PENALITE DEPASSEMENT', 'PDP']) : null
  const bt_tco_str   = isBT ? raw(['TCO (2,5%)', 'TAXE COMMUNALE', 'Taxe Communale', 'TCO', 'TAXE_COMMUNALE', 'MONTANT TCO']) : null
  const bt_redev_str = isBT ? raw(['REDEVANCE', 'Redevance', 'MONTANT REDEVANCE', 'MONTANT_REDEVANCE']) : null
  const bt_tva_str   = isBT ? raw(['TVA (18%)', 'TVA', 'Montant TVA', 'MONTANT TVA', 'MONTANT_TVA']) : null
  const bt_ht_str    = isBT ? raw(['BASE CALCUL TVA', 'MONTANT TOTAL HT', 'Montant Total HT', 'MONTANT_HTVA']) : null

  // ── cosφ mesuré (forms entête — priorité absolue) ─────────────────────────
  const cosphi_raw = parseXOF(cosphi_str)
  const cosphi_mesure = cosphi_raw > 1 ? cosphi_raw / 100 : cosphi_raw || undefined

  // ── NJ : nombre de jours de la période ───────────────────────────────────
  let periode_jours_ocr: number | undefined
  const nj_direct = parseXOF(nj_str)
  if (nj_direct > 0 && nj_direct <= 95) {
    periode_jours_ocr = Math.round(nj_direct)
  } else {
    const d1 = parseDate(date_debut_str)
    const d2 = parseDate(date_fin_str)
    if (d1 && d2) {
      const diff = diffDays(d1, d2)
      if (diff > 0 && diff <= 95) periode_jours_ocr = diff
    }
  }

  // ── Montant TTC — priorité : "TOTAL FACTURE" OCR > TTC > TOTAL SOMMES DUES > DB > HT ──
  // ⚠ SOLDE GLOBAL (2) = arriérés seuls → jamais utilisé ici
  // ⚠ amount_ttc_db peut être erroné (backend a pu stocker SOLDE GLOBAL) → en derniers recours
  const total_facture_ocr = parseXOF(total_fac_str) || totalLine?.montant || undefined
  const montant_ttc: number = total_facture_ocr
    ?? (parseXOF(ttc_str) || ttcLine?.montant || undefined)
    ?? (parseXOF(total_sommes_dues_str) || undefined)
    ?? amount_ttc_db
    ?? htLine?.montant
    ?? parseXOF(bt_ht_str)   // BT fallback : "BASE CALCUL TVA" ≈ HT
    ?? 0

  // ── K1/K2 kWh facturés ───────────────────────────────────────────────────
  // Priorité : billing QUANTITE → matrice total_fact → matrice conso → forms (dernier recours)
  // ⚠ forms Textract concatène QUANTITE+TARIF+MONTANT → toujours en dernier
  const conso_k1_kwh =
    k1Line?.quantite ||
    energy.total_fact_k1 ||
    energy.conso_k1 ||
    parseXOF(k1_form_str) ||
    undefined

  const conso_k2_kwh =
    k2Line?.quantite ||
    energy.total_fact_k2 ||
    energy.conso_k2 ||
    parseXOF(k2_form_str) ||
    undefined

  // ── Tarifs et montants K1/K2 (billing table) ─────────────────────────────
  const k1_tarif   = k1Line?.tarif    || undefined
  const k2_tarif   = k2Line?.tarif    || undefined
  const k1_montant = k1Line?.montant  || undefined
  const k2_montant = k2Line?.montant  || undefined

  // ── Consommation totale ───────────────────────────────────────────────────
  // ⚠ GP/MT : ne PAS utiliser conso_str comme source principale.
  //   buildLookup prend la DERNIÈRE colonne de chaque ligne de table.
  //   La ligne "Consommation | K1 | K2 | Total | Réactive | H1" → dernière col = H1 (heures transfo)
  //   donc "consommation" → "744" (heures) au lieu de 153 835 kWh → k2_pct aberrant.
  //   Sources fiables GP/MT : energy.total_fact_total → K1+K2 billing → energy.conso_total.
  // ✓ BT : conso_str est fiable (tableau 2 col, 1 seule valeur par ligne).
  const tranches_kwh_sum = (tranches.t1?.kwh ?? 0) + (tranches.t2?.kwh ?? 0) + (tranches.t3?.kwh ?? 0)
  const conso_kwh_total =
    energy.total_fact_total ||                               // GP/MT — "Total à facturer" total
    ((conso_k1_kwh ?? 0) + (conso_k2_kwh ?? 0)) ||          // GP/MT — K1+K2 calculés
    energy.conso_total ||                                    // GP/MT — "Consommation" colonne total
    (isBT ? parseXOF(conso_str) : null) ||                  // BT — champ CONSOMMATION (1 valeur)
    tranches_kwh_sum ||                                      // BT — somme tranches
    parseXOF(conso_str) ||                                   // fallback ultime tous types
    undefined

  // ── Montant énergie ───────────────────────────────────────────────────────
  // GP/MT : k1_montant + k2_montant depuis billing4col
  // BT    : somme des montants de tranches (13200+61123+104562=178885) ou forms
  const tranches_montant_sum = (tranches.t1?.montant ?? 0) + (tranches.t2?.montant ?? 0) + (tranches.t3?.montant ?? 0)
  const montant_energie = (k1_montant && k2_montant)
    ? k1_montant + k2_montant
    : (k1_montant ?? k2_montant ?? (tranches_montant_sum || parseXOF(bt_conso_str))) || undefined

  // ── Prime fixe ────────────────────────────────────────────────────────────
  // GP/MT : billing4col uniquement (forms concatène TARIF+MONTANT)
  // BT    : forms fallback (table 2-col, 1 valeur par ligne)
  const montant_prime_fixe = (pfLine?.montant ?? parseXOF(bt_pf_str)) || undefined
  const tarif_prime_fixe   = pfLine?.tarif   ?? undefined

  // ── Pénalité dépassement PS (PDP) ────────────────────────────────────────
  const montant_pdp = (pdpLine?.montant ?? parseXOF(bt_pdp_str)) || undefined
  const tarif_pdp   = pdpLine?.tarif   ?? undefined

  // ── cosφ pénalité/bonification (peut être négatif = bonification) ─────────
  // billing4col uniquement — forms donne QUANTITE+TARIF+MONTANT concatenés pour GP/MT
  // Pour BT cosφ n'est pas applicable (pas de ligne cosφ dans les factures BT)
  const montant_cosphi  = cosphiLine?.montant ?? undefined
  const taux_cosphi_pct = cosphiLine?.tarif   ?? undefined

  // ── TVA ───────────────────────────────────────────────────────────────────
  // GP/MT : billing4col ; BT : forms (1 valeur — "TVA (18%) : 33415")
  const montant_tva  = (tvaLine?.montant ?? parseXOF(bt_tva_str)) || undefined
  const taux_tva_pct = tvaLine?.tarif   ?? undefined

  // ── TCO, redevance ────────────────────────────────────────────────────────
  const montant_tco       = (tcoLine?.montant  ?? parseXOF(bt_tco_str))   || undefined
  const montant_redevance = (redevLine?.montant ?? parseXOF(bt_redev_str)) || undefined

  // ── Total HT ─────────────────────────────────────────────────────────────
  const montant_ht = (htLine?.montant ?? parseXOF(bt_ht_str)) || undefined

  // ── Entête technique ──────────────────────────────────────────────────────
  const puissance_max_kw = parseXOF(pmax_str) || undefined

  // 'Dépassement' en forms = kW (ex: "6 kW") — séparer du montant PDP FCFA
  const depass_raw    = parseXOF(depass_str)
  const depassement_kw = (depass_raw > 0 && depass_raw < 500) ? depass_raw : undefined

  // ── Matrice énergie ───────────────────────────────────────────────────────
  const energie_reactive_kvarh = energy.conso_reactive || undefined
  const heures_transfo_h1      = energy.conso_h1       || undefined
  const majoration_k1_kwh      = energy.majoration_k1  || undefined
  const majoration_k2_kwh      = energy.majoration_k2  || undefined

  return {
    // ── Consommation ──
    conso_kwh_total,
    conso_k1_kwh,
    conso_k2_kwh,
    // ── Montants énergie ──
    montant_energie,
    k1_tarif,
    k2_tarif,
    k1_montant,
    k2_montant,
    // ── Autres postes de facturation ──
    montant_prime_fixe,
    tarif_prime_fixe,
    montant_pdp,
    tarif_pdp,
    montant_cosphi,
    taux_cosphi_pct,
    montant_tva,
    taux_tva_pct,
    montant_tco,
    montant_redevance,
    // ── Totaux ──
    montant_ht,
    montant_ttc,
    total_facture_ocr,
    // ── Entête technique ──
    puissance_max_kw,
    depassement_kw,
    cosphi_mesure,
    // ── Matrice énergie ──
    energie_reactive_kvarh,
    heures_transfo_h1,
    majoration_k1_kwh,
    majoration_k2_kwh,
    // ── Champs contractuels ──
    type_abonnement_raw:   type_abonnement_str || undefined,
    domaine_tension_raw:   domaine_tension_str || undefined,
    puissance_souscrite_kw,
    // ── Période ──
    periode_jours_ocr,
    // ── Tranches BT (DPP/DMP/PPP/PMP) ──
    tranche1_kwh:     tranches.t1?.kwh     || undefined,
    tranche1_tarif:   tranches.t1?.tarif   || undefined,
    tranche1_montant: tranches.t1?.montant || undefined,
    tranche2_kwh:     tranches.t2?.kwh     || undefined,
    tranche2_tarif:   tranches.t2?.tarif   || undefined,
    tranche2_montant: tranches.t2?.montant || undefined,
    tranche3_kwh:     tranches.t3?.kwh     || undefined,
    tranche3_tarif:   tranches.t3?.tarif   || undefined,
    tranche3_montant: tranches.t3?.montant || undefined,
  }
}

// ─── Extraction puissance souscrite depuis OCR ────────────────────────────────

export function extractPuissanceSouscrite(ocr_data: unknown): number | null {
  const { forms, tables } = extractFormsAndTables(ocr_data)
  const dict = buildLookup(forms, tables)

  const raw = lookup(dict, [
    'PUISSANCE SOUSCRITE (kW)', 'PUISSANCE SOUSCRITE', 'PS (kW)',
    'PUISSANCE CONTRACTUELLE', 'PS',
  ])
  if (!raw) return null

  const n = parseXOF(raw)
  if (!isFinite(n) || n <= 0) return null
  return n > 10000 ? n / 1000 : n
}

// ─── Mapper SENELEC Excel → InvoiceData ──────────────────────────────────────
// Convertit une ligne factures_senelec en InvoiceData pour alimenter les KPI

export function mapSenelecToInvoiceData(row: FactureSenelecForSelector): Partial<InvoiceData> {
  const pmaxKw = row.puissance_max_kw
    ?? (row.puissance_max_relevee != null && row.puissance_max_relevee >= 900
        ? row.puissance_max_relevee / 1000
        : row.puissance_max_relevee)
    ?? undefined

  return {
    conso_kwh_total:    row.consommation_facturee ?? 0,
    montant_ttc:        row.montant_facture_ttc ?? 0,
    periode_jours_ocr:  row.nb_jour_facturation ?? undefined,
    puissance_max_kw:   pmaxKw,
    montant_energie:    row.montant_total_energie ?? undefined,
    montant_prime_fixe: row.montant_prime_fixe ?? undefined,
    montant_cosphi:     row.montant_cosinus_phi ?? undefined,
    cosphi_mesure:      row.valeur_cosinus_phi ?? undefined,
    montant_tva:        row.montant_tva ?? undefined,
    montant_tco:        row.montant_tco ?? undefined,
    montant_redevance:  row.montant_redevance ?? undefined,
    montant_ht:         row.montant_hors_tva ?? undefined,
    conso_k1_kwh:       row.cons_k1 ?? undefined,
    conso_k2_kwh:       row.cons_k2 ?? undefined,
    k1_montant:         row.montant_energie_k1 ?? undefined,
    k2_montant:         row.montant_energie_k2 ?? undefined,
  }
}

// ─── Debug helper ─────────────────────────────────────────────────────────────

export function debugOcrData(ocr_data: unknown): void {
  const { forms, tables } = extractFormsAndTables(ocr_data)
  const dict    = buildLookup(forms, tables)
  const billing = extractBillingTable4Col(tables)
  const energy  = extractEnergyMatrix(tables)

  console.group('[invoice-mapper] OCR debug')
  console.log('Forms:', forms.length, 'entrées')
  console.log('Tables brutes:', tables.length, 'tables,', tables.reduce((s, t) => s + t.length, 0), 'lignes')
  console.log('Lookup unifié:')
  dict.forEach((v, k) => console.log(`  "${k}" → "${v}"`))
  console.log('Tableau facturation 4 col:', billing.length, 'lignes')
  billing.forEach(l => console.log(`  "${l.label}" | q=${l.quantite} t=${l.tarif} m=${l.montant}`))
  console.log('Matrice énergie:', energy)
  console.groupEnd()
}
