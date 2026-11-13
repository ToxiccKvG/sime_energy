import { test, expect, type Page } from '@playwright/test'
import { nomTest } from './outils'

const NOM = nomTest('projet')
const NOM_MODIFIE = `${NOM} (modifié)`

async function ouvrirListe(page: Page) {
  await page.goto('/audits')
  await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
}

const carte = (page: Page, nom: string) =>
  page.locator('div.group').filter({ has: page.getByText(nom, { exact: true }) }).first()

test('créer un projet avec un site', async ({ page }) => {
  await ouvrirListe(page)
  await page.getByRole('button', { name: 'Nouveau projet' }).click()
  await page.getByLabel('Nom du projet').fill(NOM)

  await page.getByRole('tab', { name: 'Sites & Bâtiments' }).click()
  await page.getByPlaceholder('ex: Usine principale').fill('Site TEST')
  await page.getByPlaceholder('ex: Route de Rufisque, Dakar').fill('Plateau, Dakar')
  await page.getByRole('button', { name: 'Enregistrer ce site' }).click()

  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Projet créé').first()).toBeVisible()
  await expect(page.getByText(NOM, { exact: true })).toBeVisible()
})

test('nom obligatoire', async ({ page }) => {
  await ouvrirListe(page)
  await page.getByRole('button', { name: 'Nouveau projet' }).click()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Veuillez remplir le nom du projet').first()).toBeVisible()
})

test('rechercher un projet', async ({ page }) => {
  await ouvrirListe(page)
  await page.getByPlaceholder('Rechercher un projet…').fill(NOM)
  await expect(page.getByText(NOM, { exact: true })).toBeVisible()
  await page.getByPlaceholder('Rechercher un projet…').fill('zzz-introuvable-zzz')
  await expect(page.getByText(/Aucun résultat pour/)).toBeVisible()
})

test('la progression affichée dans la liste = celle du projet', async ({ page }) => {
  await ouvrirListe(page)
  const pctListe = (await carte(page, NOM).getByText(/^\d+%$/).textContent())!.replace('%', '')

  await carte(page, NOM).getByRole('button', { name: 'Consulter' }).click()
  await expect(page).toHaveURL(/\/audits\/[0-9a-f-]{36}/)
  const avancement = page.getByText('Avancement').locator('xpath=following-sibling::p[1]')
  await expect(avancement).toContainText(/\d+/)
  const pctDetail = (await avancement.textContent())!.replace(/\D/g, '')

  expect(pctListe).toBe(pctDetail)
})

test('modifier le nom d’un projet', async ({ page }) => {
  await ouvrirListe(page)
  const c = carte(page, NOM)
  await c.getByRole('button').nth(1).click() // crayon
  await page.getByLabel('Nom du projet').fill(NOM_MODIFIE)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Projet mis à jour').first()).toBeVisible()
  await expect(page.getByText(NOM_MODIFIE, { exact: true })).toBeVisible()
})

test('supprimer un projet (avec confirmation)', async ({ page }) => {
  await ouvrirListe(page)
  const c = carte(page, NOM_MODIFIE)
  await c.getByRole('button').nth(2).click() // corbeille
  await expect(page.getByText('Supprimer ce projet ?')).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByText(NOM_MODIFIE, { exact: true })).toHaveCount(0)
  // Confirmation affichée à l'utilisateur (toast sonner)
  await expect(page.getByText('Projet supprimé').first()).toBeVisible()
})
