import { test, expect, type Page } from '@playwright/test'
import { SESSION } from '../playwright.config'
import { creerProjet, nomTest, rest } from './outils'

const champPS = (page: Page) => page.getByPlaceholder('Ex : 165')
const champNJ = (page: Page) => page.getByPlaceholder('30', { exact: true })

async function ouvrirParametres(page: Page, auditId: string) {
  await page.goto(`/audits/${auditId}`)
  await page.getByRole('tab', { name: 'Paramètres' }).click()
  await expect(champPS(page)).toBeVisible()
}

test('paramètres de facturation du projet : enregistrés et retrouvés sur un autre poste', async ({ page, browser }) => {
  const auditId = await creerProjet(nomTest('paramètres'))
  // Les paramètres SENELEC se règlent par site : il en faut au moins un
  await rest('audit_sites', { method: 'POST', body: JSON.stringify({ audit_id: auditId, name: 'Site TEST', address: 'Plateau, Dakar' }) })

  await ouvrirParametres(page, auditId)
  await champPS(page).fill('36')
  await champNJ(page).fill('31')
  await page.getByRole('button', { name: 'Sauvegarder' }).click()

  await expect.poll(async () => (await rest(`audit_billing_params?select=puissance_souscrite_kw&audit_id=eq.${auditId}`))[0]?.puissance_souscrite_kw)
    .toBe(36)

  const autre = await browser.newContext({ storageState: SESSION })
  const page2 = await autre.newPage()
  await ouvrirParametres(page2, auditId)
  await expect(champPS(page2)).toHaveValue('36')
  await expect(champNJ(page2)).toHaveValue('31')
  await autre.close()
})
