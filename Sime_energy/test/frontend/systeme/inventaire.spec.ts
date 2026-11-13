import { test, expect, type Page } from '@playwright/test'
import { SESSION } from '../playwright.config'
import { creerProjet, nomTest, rest } from './outils'

async function ouvrirInventaire(page: Page, nomProjet: string) {
  await page.goto('/inventaire')
  await page.getByRole('combobox').filter({ hasText: 'Sélectionner un projet…' }).click()
  await page.getByRole('option', { name: nomProjet }).click()
}

/**
 * Sélectionne un nœud de l'arbre, clique « Ajouter » dans son détail, remplit et valide le dialogue,
 * puis déplie le nœud (chevron = bouton précédent) pour charger l'enfant créé.
 */
async function ajouterSous(page: Page, noeud: string, remplir: (dialogue: ReturnType<Page['getByRole']>) => Promise<void>) {
  const bouton = page.getByRole('button', { name: noeud, exact: true }).first()
  await bouton.click()
  await page.getByRole('button', { name: 'Ajouter', exact: true }).first().click()
  const dialogue = page.getByRole('dialog')
  await remplir(dialogue)
  await dialogue.getByRole('button', { name: 'Créer' }).click()
  await expect(dialogue).toBeHidden()
  await bouton.locator('xpath=preceding-sibling::button[1]').click()
}

test('hiérarchie Site → Zone → Bâtiment → Étage → Pièce', async ({ page }) => {
  const nom = nomTest('inventaire')
  const auditId = await creerProjet(nom)
  await rest('audit_sites', { method: 'POST', body: JSON.stringify({ audit_id: auditId, name: 'Site TEST', address: 'Plateau, Dakar' }) })

  // Les erreurs Supabase passent par des toasts sonner (non affichés) : on les remonte dans le rapport
  page.on('response', async r => {
    if (r.url().includes('/rest/v1/') && r.status() >= 400) console.log(`HTTP ${r.status()} ${r.request().method()} ${r.url().split('/rest/v1/')[1]} → ${await r.text()}`)
  })
  await ouvrirInventaire(page, nom)
  await expect(page.getByRole('button', { name: 'Site TEST', exact: true })).toBeVisible()

  await ajouterSous(page, 'Site TEST', d => d.getByPlaceholder('ex: Zone Maternité, Bloc Opératoire…').fill('Zone TEST'))
  await ajouterSous(page, 'Zone TEST', async d => {
    await d.getByPlaceholder('ex: Bâtiment A').fill('Bâtiment TEST')
    await d.getByRole('combobox').first().click() // type choisi : voir test « type facultatif »
    await page.getByRole('option').first().click()
  })
  let libelleEtage = ''
  await ajouterSous(page, 'Bâtiment TEST', async d => {
    await d.getByRole('combobox').first().click()
    libelleEtage = (await page.getByRole('option').first().innerText()).trim()
    await page.getByRole('option').first().click()
  })
  const [niveau] = await rest(`audit_levels?select=id&building_id=in.(${
    (await rest(`audit_buildings?select=id&audit_id=eq.${auditId}`)).map((b: { id: string }) => b.id).join(',')
  })`)
  expect(niveau, 'étage enregistré').toBeTruthy()

  await ajouterSous(page, libelleEtage, d => d.getByRole('textbox').first().fill('TEST-P1'))

  const pieces = await rest(`audit_rooms?select=code&level_id=eq.${niveau.id}`)
  expect(pieces.map((p: { code: string }) => p.code)).toContain('TEST-P1')
})

test('type de bâtiment obligatoire : refus explicite sans type', async ({ page }) => {
  const nom = nomTest('inventaire sans type')
  const auditId = await creerProjet(nom)
  await rest('audit_sites', { method: 'POST', body: JSON.stringify({ audit_id: auditId, name: 'Site TEST', address: 'Plateau, Dakar' }) })
  await ouvrirInventaire(page, nom)
  await ajouterSous(page, 'Site TEST', d => d.getByPlaceholder('ex: Zone Maternité, Bloc Opératoire…').fill('Zone TEST'))

  await page.getByRole('button', { name: 'Zone TEST', exact: true }).first().click()
  await page.getByRole('button', { name: 'Ajouter', exact: true }).first().click()
  const dialogue = page.getByRole('dialog')
  await dialogue.getByPlaceholder('ex: Bâtiment A').fill('Bâtiment sans type')
  await dialogue.getByRole('button', { name: 'Créer' }).click()

  await expect(page.getByText('Le type de bâtiment est requis').first()).toBeVisible()
  expect(await rest(`audit_buildings?select=id&audit_id=eq.${auditId}`)).toHaveLength(0)
})

test('les notes d’inventaire sont retrouvées sur un autre poste', async ({ page, browser }) => {
  const nom = nomTest('notes inventaire')
  await creerProjet(nom)
  const texte = `Constat test ${Date.now()}`

  await ouvrirInventaire(page, nom)
  await page.getByRole('tab', { name: 'Notes / Rapport' }).click()
  await page.getByRole('textbox').first().fill(texte)
  await page.getByRole('button', { name: 'Sauvegarder' }).click()
  await expect(page.getByText('Sauvegardé', { exact: true })).toBeVisible()

  // Autre navigateur, même compte : aucun localStorage partagé
  const autre = await browser.newContext({ storageState: SESSION })
  const page2 = await autre.newPage()
  await ouvrirInventaire(page2, nom)
  await page2.getByRole('tab', { name: 'Notes / Rapport' }).click()
  await expect(page2.getByRole('textbox').first()).toHaveValue(texte)
  await autre.close()
})
