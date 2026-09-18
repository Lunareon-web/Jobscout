/**
 * Shared LinkedIn helper (linkedin-jobs-api, npm).
 * Scrapet die öffentliche LinkedIn-Job­suche (Guest-API, kein Key nötig).
 * Genutzt von /api/search-linkedin (live) und /api/cron/linkedin (DB-Crawl).
 */
import { classifyJob } from './classify'
import type { CrawledJob } from './upsert'

declare const require: (id: string) => any
// CJS-Package ohne Typen — Vercel kompiliert api/ zu CJS, require existiert dort.
const { query: liQuery } = require('linkedin-jobs-api') as {
  query: (o: Record<string, string | boolean>) => Promise<LinkedInRaw[]>
}

export interface LinkedInRaw {
  position?: string
  company?: string
  location?: string
  date?: string
  agoTime?: string
  salary?: string
  jobUrl?: string
  companyLogo?: string
}

export const LINKEDIN_JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

/** maxTage → LinkedIn-Zeitraum (grob: 24hr / past week / past month). */
export function dateSincePostedFor(maxTage: number): string {
  if (maxTage <= 1) return '24hr'
  if (maxTage <= 7) return 'past week'
  return 'past month'
}

function cleanUrl(raw: string): string {
  // Tracking-Query entfernen — sonst ändert sich die URL (und damit die
  // Upsert-ID) bei jedem Lauf für dieselbe Stelle.
  return (raw || '').split('?')[0]
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LinkedIn timeout nach ${ms}ms`)), ms),
    ),
  ])
}

export function normalizeLinkedIn(j: LinkedInRaw): CrawledJob | null {
  const titel = (j.position || '').trim()
  const unternehmen = (j.company || '').trim()
  if (!titel || titel.length < 3 || !unternehmen) return null
  return {
    titel,
    unternehmen,
    // "Düsseldorf, North Rhine-Westphalia, Germany" → "Düsseldorf"
    ort: (j.location || '').split(',')[0].trim(),
    plz: '',
    datum: (j.date || '').slice(0, 10),
    url: cleanUrl(j.jobUrl || ''),
    quelle: 'LinkedIn',
    beschreibung: '',
    arbeitszeit: '',
    kategorie: classifyJob(titel),
  }
}

async function queryOne(
  keyword: string,
  standort: string,
  dateSincePosted: string,
): Promise<CrawledJob[]> {
  const raw = await withTimeout(
    liQuery({
      keyword,
      location: standort,
      dateSincePosted,
      sortBy: 'recent',
      limit: '8',
      page: '0',
    }),
    15_000,
  )
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeLinkedIn)
    .filter((j): j is CrawledJob => j !== null)
}

/**
 * Alle Jobtitel abfragen, max `concurrency` parallel (schont LinkedIn-Rate-Limit).
 * Liefert { jobs, perTitle } für Logging.
 */
export async function fetchLinkedIn(
  jobtitel: string[],
  standort: string,
  maxTage: number,
  concurrency = 4,
): Promise<{ jobs: CrawledJob[]; perTitle: Record<string, number> }> {
  const dateSincePosted = dateSincePostedFor(maxTage)
  const perTitle: Record<string, number> = {}
  const collected: CrawledJob[] = []
  const queue = [...jobtitel]

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length) {
        const titel = queue.shift()!
        try {
          const jobs = await queryOne(titel, standort, dateSincePosted)
          perTitle[titel] = jobs.length
          collected.push(...jobs)
        } catch {
          perTitle[titel] = 0
        }
      }
    },
  )
  await Promise.all(workers)
  return { jobs: collected, perTitle }
}

/** Deduplizieren (Titel+Firma) + Alters-Cutoff wie in den anderen Quellen. */
export function dedupeFilterLinkedIn(
  jobs: CrawledJob[],
  maxTage: number,
): CrawledJob[] {
  const cutoff = new Date(Date.now() - maxTage * 86_400_000)
  const seen = new Set<string>()
  return jobs
    .filter(j => {
      if (!j.titel || j.titel.length < 3) return false
      const key = `${j.titel}|${j.unternehmen}`.toLowerCase().replace(/\s/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      if (j.datum) {
        const d = new Date(j.datum)
        if (!isNaN(d.getTime()) && d < cutoff) return false
      }
      return true
    })
    .sort((a, b) => new Date(b.datum || 0).getTime() - new Date(a.datum || 0).getTime())
}
