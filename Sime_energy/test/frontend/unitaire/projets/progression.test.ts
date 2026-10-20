import { describe, it, expect } from 'vitest'
import { computeAuditCompletion } from '@/lib/audit-service'

// Pondération annoncée dans audit-service.ts :
//   infos de base 20 % · infos générales 20 % · personnel 10 % · statut 10 % · données structurelles 40 %

const COMPLET = {
  name: 'Mairie de Dakar', responsable: 'K. Mendy', start_date: '2026-01-01', end_date: '2026-03-01',
  status: 'completed',
  general_info: { nomEtablissement: 'Hôtel de ville', secteur: 'SERVICES', ville: 'Dakar', effectifs: 120 },
  personnel: { directeur: { nom: 'A' }, technicien: { nom: 'B' } },
}

describe('Progression d’un projet', () => {
  it('projet vide = 0 %', () => {
    expect(computeAuditCompletion({})).toBe(0)
  })

  it('projet complet avec sites, bâtiments et plus de 5 équipements = 100 %', () => {
    expect(computeAuditCompletion(COMPLET, { totalSites: 1, totalBuildings: 2, totalEquipment: 6 })).toBe(100)
  })

  it('les 4 infos de base valent 20 %', () => {
    const { name, responsable, start_date, end_date } = COMPLET
    expect(computeAuditCompletion({ name, responsable, start_date, end_date })).toBe(20)
  })

  it('les données structurelles valent 40 %', () => {
    expect(computeAuditCompletion({}, { totalSites: 1, totalBuildings: 1, totalEquipment: 6 })).toBe(40)
  })
})
