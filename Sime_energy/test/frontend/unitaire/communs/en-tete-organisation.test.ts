// En-tête x-organisation-id ajouté par le client Supabase (lib/supabase.ts) : il limite les
// données IOT à l'organisation sélectionnée (migration 20261114_iot_sites_organisation_selectionnee).
// Il ne doit partir que vers l'API REST : les fonctions serveur (inviter-membre…) ne l'autorisent
// pas dans leur CORS, l'envoyer casserait les invitations.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { supabase, definirOrganisationSelectionnee } from '@/lib/supabase'

const appels: { url: string; organisation: string | null }[] = []

beforeEach(() => {
  appels.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    appels.push({ url, organisation: new Headers(init?.headers).get('x-organisation-id') })
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

afterEach(() => {
  definirOrganisationSelectionnee(null)
  vi.unstubAllGlobals()
})

const appelVers = (morceau: string) => appels.find(a => a.url.includes(morceau))

describe('En-tête de l\'organisation sélectionnée', () => {
  it('ajouté aux lectures de tables et aux fonctions SQL', async () => {
    definirOrganisationSelectionnee('org-a')
    await supabase.from('shelly_cl').select('site')
    await supabase.rpc('fn_energy_by_day', {})
    expect(appelVers('/rest/v1/shelly_cl')?.organisation).toBe('org-a')
    expect(appelVers('/rest/v1/rpc/fn_energy_by_day')?.organisation).toBe('org-a')
  })

  it('suit le changement d\'organisation', async () => {
    definirOrganisationSelectionnee('org-a')
    definirOrganisationSelectionnee('org-b')
    await supabase.from('audits').select('id')
    expect(appelVers('/rest/v1/audits')?.organisation).toBe('org-b')
  })

  it('absent sans organisation sélectionnée', async () => {
    await supabase.from('shelly_cl').select('site')
    expect(appelVers('/rest/v1/shelly_cl')?.organisation).toBeNull()
  })

  it('jamais envoyé aux fonctions serveur', async () => {
    definirOrganisationSelectionnee('org-a')
    await supabase.functions.invoke('inviter-membre', { body: {} })
    const appel = appelVers('/functions/v1/inviter-membre')
    expect(appel).toBeDefined()
    expect(appel?.organisation).toBeNull()
  })
})
