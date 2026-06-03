// Mirror of src/lib/utils.ts classifyJob — must stay in sync
export type JobKategorie = 'design' | 'interior' | 'architektur' | 'management' | 'sonstiges'

export function classifyJob(titel: string): JobKategorie {
  const t = titel.toLowerCase()
  if (/interior|innen|raumplan|raumgestalt/i.test(t)) return 'interior'
  if (/design|designer|produkt|visual|kreativ|brand|grafik|ux|ui/i.test(t)) return 'design'
  if (/architekt|architektur|bauplan|stadtplan/i.test(t)) return 'architektur'
  if (/manager|management|projekt|project|lead|leiter|direktor|director|head of/i.test(t)) return 'management'
  return 'sonstiges'
}
