import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import { creerProjet, nomTest, rest } from './outils'

// Import de factures depuis l'onglet « Factures OCR » : la facture est créée « En attente »,
// puis le backend (Textract + Mistral réels) doit la faire passer « En traitement » avec ses montants.

const PDF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/facture-synthetique.pdf')

async function importer(page: Page, nomProjet: string, fichier: Parameters<Page['setInputFiles']>[1]) {
  // Réponses en erreur du backend, remontées dans le rapport (le toast disparaît avant l'échec du test)
  page.on('response', async r => {
    if (r.url().includes('/api/V1/') && r.status() >= 400) console.log(`Backend HTTP ${r.status()} ${r.url().split('/api/V1')[1]} → ${await r.text()}`)
  })
  page.on('requestfailed', r => {
    if (r.url().includes('/api/V1/')) console.log(`Backend injoignable ${r.url().split('/api/V1')[1]} → ${r.failure()?.errorText}`)
  })
  await page.goto('/facturation')
  await page.getByRole('button', { name: 'Importer' }).first().click()
  const dialogue = page.getByRole('dialog')
  await dialogue.getByRole('combobox').click()
  await page.getByRole('option', { name: nomProjet }).click()
  await dialogue.locator('#file-upload').setInputFiles(fichier)
  await dialogue.getByRole('button', { name: /^Traiter/ }).click()
  await expect(page.getByText('Fichiers importés').first()).toBeVisible()
}

async function factures(auditId: string) {
  return rest(`audit_invoices?select=status,amount,ocr_data&audit_id=eq.${auditId}`)
}

test('facture PDF : OCR réel puis passage « En traitement »', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  const nom = nomTest('import PDF')
  const auditId = await creerProjet(nom)
  await importer(page, nom, PDF)

  await expect.poll(async () => (await factures(auditId))[0]?.status, {
    message: 'La facture doit quitter le statut « En attente » après l’OCR', timeout: 180_000, intervals: [5_000],
  }).toBe('processing')
  const [f] = await factures(auditId)
  expect(f.amount).toBe(38759)
})

test('facture Excel via « Importer » : traitée par le backend', async ({ page }) => {
  test.setTimeout(2 * 60_000)
  const nom = nomTest('import Excel OCR')
  const auditId = await creerProjet(nom)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Numero Facture', 'Montant Facture TTC'], [990003, 944000]]), 'Feuil1')
  await importer(page, nom, {
    name: 'factures.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
  })

  await expect.poll(async () => (await factures(auditId))[0]?.status, {
    message: 'Le fichier Excel doit être traité par le backend', timeout: 60_000, intervals: [3_000],
  }).toBe('processing')
})

test('un échec de traitement est signalé à l’utilisateur', async ({ page }) => {
  test.setTimeout(2 * 60_000)
  const nom = nomTest('import PDF corrompu')
  await creerProjet(nom)
  await importer(page, nom, { name: 'corrompu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pas un pdf') })
  await expect(page.getByText(/échec|erreur|impossible/i).first()).toBeVisible({ timeout: 60_000 })
})
