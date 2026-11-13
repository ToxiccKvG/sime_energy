import { test, expect } from '@playwright/test'
import { creerProjet, nomTest, rest, utilisateurCourant } from './outils'

// Les corrections faites dans l'écran d'annotation doivent être enregistrées dans ocr_data
// (updateInvoice les ignorait : elles disparaissaient au rechargement de la page).
// La facture est créée directement en base avec un OCR synthétique : aucun appel Textract.

test('une valeur corrigée dans l’annotation est enregistrée et retrouvée après rechargement', async ({ page }) => {
  const auditId = await creerProjet(nomTest('annotation'))
  const { userId, orgId } = await utilisateurCourant()
  const [facture] = await rest('audit_invoices', {
    method: 'POST',
    body: JSON.stringify({
      audit_id: auditId,
      organization_id: orgId,
      uploaded_by: userId,
      file_name: 'annotation-test.pdf',
      file_url: '',
      status: 'processing',
      confidence_score: 50,
      ocr_data: { pages: [{ page_number: 1, forms: [{ Key: 'Champ de test', Value: 'VALEUR-INITIALE' }], tables: [] }] },
    }),
  })

  await page.goto(`/annotation?auditId=${auditId}`)
  await page.getByText('VALEUR-INITIALE', { exact: true }).click()
  const champ = page.locator('input:focus')
  await champ.fill('VALEUR-CORRIGEE')
  await champ.press('Enter')

  await expect.poll(async () => {
    const [f] = await rest(`audit_invoices?select=ocr_data&id=eq.${facture.id}`)
    return f.ocr_data?.pages?.[0]?.forms?.[0]?.Value
  }, { message: 'La correction doit être enregistrée dans ocr_data', timeout: 15_000 }).toBe('VALEUR-CORRIGEE')

  await page.reload()
  await expect(page.getByText('VALEUR-CORRIGEE', { exact: true })).toBeVisible()
  await expect(page.getByText('VALEUR-INITIALE', { exact: true })).toHaveCount(0)
})
