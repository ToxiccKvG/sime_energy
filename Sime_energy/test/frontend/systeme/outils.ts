import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Accès Supabase service_role (clé du backend) — uniquement pour nettoyer les données « TEST-AUTO ».
const ENV_BACK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../sime-backend-main/.env')

function lireEnv(fichier: string): Record<string, string> {
  return Object.fromEntries(
    fs.readFileSync(fichier, 'utf-8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
  )
}

export const PREFIXE = 'TEST-AUTO'

// Nom fixe : un worker redémarré après un échec réévalue le fichier et doit retrouver les mêmes données
export const nomTest = (quoi: string) => `${PREFIXE} ${quoi}`

/** Requête REST Supabase avec la clé service_role. */
export async function rest(chemin: string, init: RequestInit = {}) {
  const env = lireEnv(ENV_BACK)
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  })
  if (!r.ok) throw new Error(`Supabase ${chemin} → ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

/** Supprime tous les projets « TEST-AUTO … » (et leurs factures) — filet de sécurité en fin de suite. */
export async function nettoyerProjetsTest() {
  const audits: { id: string }[] = await rest(`audits?select=id&name=like.${encodeURIComponent(PREFIXE)}*`)
  for (const { id } of audits) {
    await rest(`audit_invoices?audit_id=eq.${id}`, { method: 'DELETE' })
    await rest(`factures_senelec?audit_id=eq.${id}`, { method: 'DELETE' })
    await rest(`audit_billing_params?audit_id=eq.${id}`, { method: 'DELETE' })
    await rest(`audit_buildings?audit_id=eq.${id}`, { method: 'DELETE' })
    await rest(`audit_sites?audit_id=eq.${id}`, { method: 'DELETE' })
    await rest(`audits?id=eq.${id}`, { method: 'DELETE' })
  }
}

const SESSION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../playwright/.auth/session.json')

/** Utilisateur connecté (session Playwright) et son organisation active (même règle que l'app). */
export async function utilisateurCourant(): Promise<{ userId: string; orgId: string }> {
  const etat = JSON.parse(fs.readFileSync(SESSION, 'utf-8'))
  const item = etat.origins.flatMap((o: { localStorage: { name: string; value: string }[] }) => o.localStorage)
    .find((i: { name: string }) => /^sb-.*-auth-token$/.test(i.name))
  const userId = JSON.parse(item.value).user.id
  const [lien] = await rest(`organization_users?select=organization_id&user_id=eq.${userId}&limit=1`)
  return { userId, orgId: lien.organization_id }
}

/** Crée un projet « TEST-AUTO » directement en base et renvoie son id. */
export async function creerProjet(nom: string): Promise<string> {
  const { userId, orgId } = await utilisateurCourant()
  const [audit] = await rest('audits', {
    method: 'POST',
    body: JSON.stringify({ name: nom, organization_id: orgId, created_by: userId, status: 'planned' }),
  })
  return audit.id
}
