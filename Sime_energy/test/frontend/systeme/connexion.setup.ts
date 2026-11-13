import { test } from '@playwright/test'
import { SESSION } from '../playwright.config'

// Connexion manuelle : l'utilisateur se connecte lui-même dans la fenêtre ouverte.
test('connexion manuelle', async ({ page }) => {
  test.setTimeout(15 * 60_000)
  await page.goto('/login')
  await page.waitForURL(url => !/\/(login|auth|signup)/.test(url.pathname), { timeout: 15 * 60_000 })
  await page.waitForLoadState('networkidle')
  await page.context().storageState({ path: SESSION })
})
