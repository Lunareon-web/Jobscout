/**
 * Unternehmens-Score aus gefundenen Job-Ausschreibungen berechnen.
 * Portiert aus jobscout-backend/agents/scoring.py (regelbasiert, kein LLM).
 *
 * Score-Komponenten (Cap 100):
 *   1. Branchen-Basis aus Job-Kategorie            max 25
 *   2. Service-/Branch-Keywords (Titel+Beschr.)    max 20
 *   3. Job-Titel-Bonus (Relevanz)                  max 25
 *   4. Projekt-/Signal-Bonus                       max 15
 *   5. Multi-Job-Bonus (mehrere Ausschreibungen)   max 15
 *
 * Prioritäts-Bands: 90+=A+, 80+=A, 70+=B, 60+=C, sonst D
 */
import type { JobCategory } from '../types'

const INDUSTRY_BASE: Record<JobCategory, number> = {
  design:      25,
  interior:    25,
  architektur: 20,
  management:  15,
  sonstiges:    5,
}

// Keywords, die auf relevante Dienstleistungen/Branche hindeuten
const SERVICE_KEYWORDS = [
  'store', 'retail', 'shop', 'shopkonzept', 'visual merchandising',
  'workplace', 'office', 'büro', 'innenarchitektur', 'raumplanung',
  'ladenbau', 'messebau', 'ausstellungsbau', 'shop fitting', 'einrichtung',
  'produktdesign', 'grafikdesign', 'kommunikationsdesign', 'branding',
  'projektleitung', 'projektmanager', 'bauleitung',
]

// Job-Titel, die auf hochwertige Positionen hindeuten
const TITLE_BONUS_KEYWORDS = [
  'leiter', 'leiterin', 'head of', 'director', 'manager', 'managerin',
  'projektleiter', 'projektleiterin', 'bauleiter', 'bauleiterin',
  'creative', 'art director', 'design lead', 'ux', 'ui',
]

const SIGNAL_KEYWORDS = [
  'projekt', 'stelle', 'vakanz', 'offen', 'einstellung', 'karriere',
  'wir suchen', 'team', 'wachstum', 'expansion', 'neubau', 'sanierung',
]

export function computeCompanyScore(
  jobs: Array<{ titel: string; beschreibung?: string; kategorie?: JobCategory; ort?: string }>,
  kategorieHints: JobCategory[],
): number {
  if (!jobs.length) return 0

  let score = 0

  // 1. Branchen-Basis (aus der häufigsten Kategorie)
  const cats = kategorieHints.filter(Boolean)
  const baseCat = cats.length ? cats[0] : 'sonstiges'
  score += INDUSTRY_BASE[baseCat] ?? INDUSTRY_BASE.sonstiges

  // 2. Service-/Branch-Keywords (Titel + Beschreibung)
  const text = jobs.map(j => `${j.titel} ${j.beschreibung || ''}`.toLowerCase()).join(' ')
  const serviceHits = SERVICE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase())).length
  score += Math.min(serviceHits * 4, 20)

  // 3. Job-Titel-Bonus (max 25)
  const titleHits = jobs.filter(j => TITLE_BONUS_KEYWORDS.some(kw => j.titel.toLowerCase().includes(kw))).length
  score += Math.min(titleHits * 8, 25)

  // 4. Signal-Bonus (max 15)
  const signalHits = jobs.filter(j => SIGNAL_KEYWORDS.some(kw => j.titel.toLowerCase().includes(kw) || (j.beschreibung || '').toLowerCase().includes(kw))).length
  score += Math.min(signalHits * 3, 15)

  // 5. Multi-Job-Bonus (mehrere Ausschreibungen = aktives Unternehmen, max 15)
  score += Math.min(jobs.length * 3, 15)

  return Math.min(score, 100)
}

export function priorityFromScore(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export function scoreLabel(score: number): string {
  return `${score} (${priorityFromScore(score)})`
}
