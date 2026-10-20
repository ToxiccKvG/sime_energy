import { test, expect, type Page } from '@playwright/test'
import { creerProjet, nomTest, rest, utilisateurCourant } from './outils'

/** Champ de la saisie manuelle : <Label> non relié à l'input, on passe par le conteneur du champ. */
const champ = (page: Page, libelle: string) =>
  page.locator('div.space-y-1\\.5').filter({ has: page.locator('label', { hasText: new RegExp(`^${libelle}$`) }) }).first()

// Grille 2023 DGP : Tpf = 956,13 FCFA/kW/mois — PS 36 kW, Pmax 40 kW, 1er → 31 mars (NJ = 31)
const TPF = 956.13

test('saisie manuelle GP : NJ, prime fixe et PDP selon les règles de référence', async ({ page }) => {
  const nom = nomTest('saisie manuelle')
  await creerProjet(nom)

  await page.goto('/facturation')
  await page.getByRole('button', { name: 'Importer' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Saisie manuelle' }).click()

  await champ(page, 'Projet \\*').getByRole('combobox').click()
  await page.getByRole('option', { name: nom }).click()
  await champ(page, 'Grille tarifaire').getByRole('combobox').click()
  await page.getByRole('option', { name: '2023', exact: true }).click()
  await page.getByRole('button', { name: 'BT', exact: true }).click()
  await page.getByRole('button', { name: 'DGP', exact: true }).click()

  await champ(page, 'PS souscrite \\(kW\\)').locator('input').fill('36')
  await champ(page, 'Pmax relevée \\(kW\\)').locator('input').fill('40')
  await champ(page, 'Date début').locator('input').fill('2023-03-01')
  await champ(page, 'Date fin').locator('input').fill('2023-03-31')

  const ligne = (libelle: string) => page.locator('tr').filter({ hasText: libelle }).first()
  const montant = async (libelle: string) => Number((await ligne(libelle).locator('td').last().innerText()).replace(/\D/g, ''))
  const pdp = Number((await ligne('Pénalité dépassement PS').locator('input').inputValue()).replace(/\D/g, ''))

  await expect(page.getByPlaceholder(/^31[,.]00$/), 'NJ = fin − début + 1').toBeVisible()
  expect.soft(await montant('Prime fixe'), 'prime fixe = Tpf × PS × NJ/30').toBe(Math.round(TPF * 36 * 31 / 30))
  expect.soft(pdp, 'PDP = 1,5 × Tpf × (Pmax − PS) × NJ/30').toBe(Math.round(1.5 * TPF * 4 * 31 / 30))
})

test('le compteur Quarantaine est juste dès l’ouverture de la page', async ({ page }) => {
  const nom = nomTest('quarantaine')
  const auditId = await creerProjet(nom)
  const { userId, orgId } = await utilisateurCourant()
  const avant: unknown[] = await rest(`audit_invoices?select=id&organization_id=eq.${orgId}&is_quarantined=eq.true`)
  await rest('audit_invoices', {
    method: 'POST',
    body: JSON.stringify({
      audit_id: auditId, organization_id: orgId, uploaded_by: userId, file_name: 'test-quarantaine.pdf', file_url: '',
      status: 'verified', is_quarantined: true, quarantine_reason: 'Test automatisé', quarantine_delta_pct: 12,
    }),
  })

  await page.goto('/facturation')
  const bouton = page.getByRole('button', { name: /Quarantaine/ }).first()
  await expect(bouton).toBeVisible()
  await expect(bouton, 'nombre de factures en quarantaine avant ouverture du panneau').toContainText(String(avant.length + 1))
})
