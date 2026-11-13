import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { BILLING_TEMPLATE_COLUMNS } from '../../../sime-front/src/components/invoices/billing-import.types'
import { creerProjet, nomTest, rest, utilisateurCourant } from './outils'

// Import du classeur de factures SENELEC (template standard) → réparation auto → enregistrement.
// Règles de référence : NJ = fin − début + 1 ; PF = Tpf × PS × NJ/30 ; PDP = 1,5 × Tpf × (Pmax − PS) × NJ/30
// Grille 2023 DGP : Tpf = 956,13 FCFA/kW/mois.

const NOM = nomTest('import Excel')
const TPF = 956.13
const PARTENAIRE = 'TEST-AUTO MAIRIE'

const BASE = {
  numeroCompteContrat: 'TEST-AUTO-CC', partenaire: PARTENAIRE, appartenance: 'Tests',
  dateComptableFacture: '05/04/2023', typeTarifNumero: 'DGP', puissanceSouscrite: 36, puissanceMaxRelevee: 40,
  consommationFacturee: 6000, montantTotalEnergie: 700000, montantTVA: 144000, montantFactureTTC: 944000,
}
const LIGNES = [
  // NJ absent → calculé depuis les dates (1er → 31 mars)
  { ...BASE, numeroFacture: 990001, dateDebutPeriode: '01/03/2023', dateFinPeriode: '31/03/2023', montantHorsTVA: 800000 },
  // NJ = 30 fourni, HT absent → PF, PDP et HT calculés
  { ...BASE, numeroFacture: 990002, dateDebutPeriode: '01/04/2023', dateFinPeriode: '30/04/2023', nbJourFacturation: 30 },
]

function classeur(): Buffer {
  const entetes = BILLING_TEMPLATE_COLUMNS.map(c => c.label)
  const donnees = LIGNES.map(l => BILLING_TEMPLATE_COLUMNS.map(c => (l as Record<string, unknown>)[c.key] ?? null))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([entetes, ...donnees]), 'Feuil1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('import Excel SENELEC : correspondance, réparation, enregistrement', async ({ page }) => {
  const auditId = await creerProjet(NOM)
  const { orgId } = await utilisateurCourant()

  await page.goto('/facturation')
  await page.getByRole('button', { name: /Données SENELEC/ }).click()
  await page.getByRole('button', { name: 'Import Excel' }).click()

  await page.getByRole('combobox').filter({ hasText: 'Sélectionner un projet…' }).click()
  await page.getByRole('option', { name: NOM }).click()
  await page.locator('input[type=file][accept=".xlsx"]').setInputFiles({
    name: 'factures-test.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: classeur(),
  })

  // Étape correspondance des colonnes
  await expect(page.getByText('Template SENELEC standard reconnu')).toBeVisible()
  await page.getByRole('button', { name: /Continuer vers l'aperçu/ }).click()

  // Étape aperçu : réparation automatique puis chargement
  await page.getByRole('button', { name: /Résolution auto/ }).click()
  await page.getByText('Calcul automatique').click()
  await page.getByRole('button', { name: 'Charger les données' }).click()

  await expect.poll(async () => (await rest(`factures_senelec?select=id&audit_id=eq.${auditId}`)).length, { timeout: 30_000 }).toBe(2)
  const [mars, avril] = await rest(`factures_senelec?audit_id=eq.${auditId}&order=numero_facture`)

  expect.soft(mars.organization_id, 'organisation').toBe(orgId)
  expect.soft(mars.nb_jour_facturation, 'NJ = fin − début + 1').toBe(31)
  expect.soft(avril.montant_prime_fixe, 'prime fixe = Tpf × PS × NJ/30').toBe(Math.round(TPF * 36 * 30 / 30))
  expect.soft(avril.penalites_depassement, 'PDP = 1,5 × Tpf × (Pmax − PS) × NJ/30').toBe(Math.round(1.5 * TPF * 4 * 30 / 30))
  expect.soft(avril.montant_hors_tva, 'HT = TTC − TVA').toBe(944000 - 144000)

  // Les factures importées apparaissent dans l'onglet Données SENELEC
  await expect(page.getByText(PARTENAIRE).first()).toBeVisible()
})
