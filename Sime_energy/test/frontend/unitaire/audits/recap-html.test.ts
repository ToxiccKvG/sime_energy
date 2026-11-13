import { describe, it, expect } from 'vitest'
import { buildRecapHTML } from '@/components/audits/questionnaire/recap-html'
import { createEmptyQuestionnaire } from '@/components/audits/questionnaire/questionnaire-data'
import { QUESTIONNAIRE_SCHEMA } from '@/constants/pv-questionnaire-schema'

// Faille XSS stockée : le récapitulatif est écrit avec document.write dans une fenêtre
// de même origine que l'application. Aucune valeur saisie ne doit y devenir du HTML actif.

const PIEGE = '<img src=x onerror="alert(1)">'

function questionnairePiege() {
  const q = createEmptyQuestionnaire(`Site ${PIEGE}`)
  q.sections[0].fields.nomSite = `Ligne 1\n${PIEGE}`
  const avecCases = QUESTIONNAIRE_SCHEMA.findIndex(s => s.checkboxItems?.length)
  const item = q.sections[avecCases].checkboxItems![0]
  item.checked = true
  item.comment = PIEGE
  const avecTexte = QUESTIONNAIRE_SCHEMA.findIndex(s => s.hasFreeText)
  q.sections[avecTexte].freeText = `<script>alert(2)</script>`
  q.customFields = [{ id: 'cf1', key: `<b>${PIEGE}</b>`, value: '"><svg onload=alert(3)>' }]
  return q
}

describe('Récapitulatif PDF du questionnaire', () => {
  const html = buildRecapHTML(questionnairePiege())

  it("n'insère aucune balise venant des valeurs saisies", () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<b>')
  })

  it('affiche les valeurs piégées comme du texte', () => {
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
    expect(html).toContain('&quot;&gt;&lt;svg onload=alert(3)&gt;')
  })

  it('garde les retours à la ligne des champs', () => {
    expect(html).toContain('Ligne 1<br>&lt;img')
  })

  it('interdit tout script dans la fenêtre d\'impression', () => {
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`)
  })
})
