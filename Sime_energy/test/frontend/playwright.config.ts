import { defineConfig } from '@playwright/test'

// Tests système : vraie application (Vite :8080 + FastAPI :8000) sur la vraie Supabase.
// Session : `bun run connexion` (connexion manuelle, sauvegardée dans playwright/.auth/).
export const SESSION = 'playwright/.auth/session.json'

export default defineConfig({
  testDir: './systeme',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './systeme/nettoyage.global.ts',
  globalTeardown: './systeme/nettoyage.global.ts',
  use: {
    baseURL: 'http://localhost:8080',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'connexion', testMatch: /connexion\.setup\.ts/ },
    { name: 'e2e', testIgnore: /connexion\.setup\.ts/, use: { storageState: SESSION } },
  ],
  webServer: [
    { command: 'bun run dev', cwd: '../../sime-front', url: 'http://localhost:8080', reuseExistingServer: true, timeout: 120_000 },
    { command: '.venv/bin/uvicorn main:app --port 8000', cwd: '../../sime-backend-main', url: 'http://127.0.0.1:8000/docs', reuseExistingServer: true, timeout: 120_000 },
  ],
})
