/**
 * Jours fériés légaux du Sénégal.
 * Dates fixes légales : loi n°74-52 du 4 novembre 1974.
 * Fêtes islamiques variables : estimations Hijri — à vérifier chaque année.
 */

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  title: string;
  type: 'fixed' | 'islamic';
}

const FIXED: { month: number; day: number; title: string }[] = [
  { month: 1,  day: 1,  title: "Jour de l'An" },
  { month: 4,  day: 4,  title: "Fête de l'Indépendance" },
  { month: 5,  day: 1,  title: "Fête du Travail" },
  { month: 8,  day: 15, title: "Assomption" },
  { month: 11, day: 1,  title: "Toussaint" },
  { month: 12, day: 25, title: "Noël" },
];

// Dates islamiques par année (estimations — sujettes à observation lunaire)
const ISLAMIC: Record<number, { date: string; title: string }[]> = {
  2024: [
    { date: '2024-01-25', title: 'Tamkharit (Achoura)' },
    { date: '2024-03-29', title: 'Korité (Aïd el-Fitr)' },
    { date: '2024-06-06', title: 'Tabaski (Aïd el-Adha)' },
    { date: '2024-07-07', title: 'Tabaski 2e jour' },
    { date: '2024-09-15', title: 'Maouloud (Mawlid)' },
  ],
  2025: [
    { date: '2025-01-14', title: 'Tamkharit (Achoura)' },
    { date: '2025-03-31', title: 'Korité (Aïd el-Fitr)' },
    { date: '2025-06-06', title: 'Tabaski (Aïd el-Adha)' },
    { date: '2025-06-07', title: 'Tabaski 2e jour' },
    { date: '2025-09-04', title: 'Maouloud (Mawlid)' },
  ],
  2026: [
    { date: '2026-01-03', title: 'Tamkharit (Achoura)' },
    { date: '2026-03-20', title: 'Korité (Aïd el-Fitr)' },
    { date: '2026-05-27', title: 'Tabaski (Aïd el-Adha)' },
    { date: '2026-05-28', title: 'Tabaski 2e jour' },
    { date: '2026-08-25', title: 'Maouloud (Mawlid)' },
  ],
  2027: [
    { date: '2027-01-14', title: 'Tamkharit (Achoura)' },
    { date: '2027-03-10', title: 'Korité (Aïd el-Fitr)' },
    { date: '2027-05-16', title: 'Tabaski (Aïd el-Adha)' },
    { date: '2027-05-17', title: 'Tabaski 2e jour' },
    { date: '2027-08-14', title: 'Maouloud (Mawlid)' },
  ],
};

export function getSenegalHolidays(year: number): HolidayEntry[] {
  const fixed = FIXED.map(h => ({
    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
    title: h.title,
    type: 'fixed' as const,
  }));
  const islamic = (ISLAMIC[year] || []).map(h => ({ ...h, type: 'islamic' as const }));
  return [...fixed, ...islamic].sort((a, b) => a.date.localeCompare(b.date));
}
