import type { Job, JobCategory } from '../types'

export function classifyJob(titel: string): JobCategory {
  const t = titel.toLowerCase()
  if (/interior|innen|raumplan|raumgestalt/i.test(t)) return 'interior'
  if (/design|designer|produkt|visual|kreativ|brand|grafik|ux|ui/i.test(t)) return 'design'
  if (/architekt|architektur|bauplan|stadtplan/i.test(t)) return 'architektur'
  if (/manager|management|projekt|project|lead|leiter|direktor|director|head of/i.test(t)) return 'management'
  return 'sonstiges'
}

export function jobEffectiveDate(j: { datum?: string | null; found_at?: string | null; created_at?: string | null }): Date | null {
  // Primär: Veröffentlichungsdatum; Fallback: found_at/created_at (für Direkt-Funde ohne Datum)
  for (const raw of [j.datum, j.found_at, j.created_at]) {
    if (!raw) continue
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export function isJobFresh(
  j: { datum?: string | null; found_at?: string | null; created_at?: string | null },
  maxTage: number,
): boolean {
  const d = jobEffectiveDate(j)
  if (!d) return true // ohne jedes Datum nicht ausblenden (wäre sonst Direkt-Fund-Verlust)
  return Date.now() - d.getTime() <= maxTage * 86_400_000
}
export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.round((Date.now() - d.getTime()) / 86_400_000)
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

export function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>()
  return jobs.filter(j => {
    const key = `${j.titel}|${j.unternehmen}|${j.url}`.toLowerCase().replace(/\s/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isDirectFind(job: Job): boolean {
  return job.quelle.toLowerCase().includes('direkt')
}

const CATEGORY_LABELS: Record<string, string> = {
  design: 'Design',
  interior: 'Interior',
  architektur: 'Architektur',
  management: 'Management',
  sonstiges: 'Sonstige',
  direkt: 'Direktfunde',
  all: 'Alle',
}

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat
}
