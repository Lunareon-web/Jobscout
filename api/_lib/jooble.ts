/**
 * Jooble API (de.jooble.org)
 * Key ist länderspezifisch und wird NUR serverseitig (Vercel Env) gehalten —
 * niemals im Frontend. Freier Key: 500 Anfragen Lifetime-Gesamtlimit.
 */
import type { CrawledJob } from './upsert'
import { classifyJob } from './classify'

export interface JoobleJob {
  title?: string
  company?: string
  location?: string
  salary?: string
  type?: string
  snippet?: string
  link?: string
  id?: string
}

export const JOOBLE_KEYWORDS = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

export async function fetchJooble(
  apiKey: string,
  keywords: string[],
  location: string,
  radius = '50',
  page = '1',
): Promise<{ jobs: CrawledJob[]; rawCount: number; error?: string }> {
  if (!apiKey) {
    return { jobs: [], rawCount: 0, error: 'JOOBLE_API_KEY nicht in den Vercel Env Vars gesetzt' }
  }

  const url = `https://de.jooble.org/api/${apiKey}`
  const body = JSON.stringify({
    keywords: keywords.join(' '),
    location,
    radius,
    page,
  })

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) {
      return { jobs: [], rawCount: 0, error: `Jooble HTTP ${r.status}` }
    }
    const data = await r.json()
    const raw: JoobleJob[] = Array.isArray(data?.jobs) ? data.jobs : []
    const jobs = raw.map(normalizeJooble).filter((j): j is CrawledJob => j !== null)
    return { jobs, rawCount: typeof data.totalCount === 'number' ? data.totalCount : raw.length }
  } catch (e) {
    return { jobs: [], rawCount: 0, error: String(e) }
  }
}

function normalizeJooble(j: JoobleJob): CrawledJob | null {
  const titel = (j.title || '').trim()
  if (!titel || titel.length < 3) return null

  const location = (j.location || '').trim()
  const ort = location.split(',')[0].trim() || 'Düsseldorf'
  const plzMatch = location.match(/\b\d{5}\b/)

  return {
    titel,
    unternehmen: (j.company || '').trim(),
    ort,
    plz: plzMatch?.[0] || '',
    datum: '',
    url: j.link || '',
    quelle: 'Jooble',
    beschreibung: (j.snippet || '').slice(0, 500),
    arbeitszeit: j.type || '',
    kategorie: classifyJob(titel),
  }
}

/**
 * Vercel Function Handler für Jooble Live-Suche.
 * Gibt IMMER 200 zurück (auch bei Fehlern), damit das Frontend
 * den Fehler pro Quelle anzeigen kann.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const location = (req.query.location as string) || 'Düsseldorf'
  const keywordsParam = req.query.keywords as string
  const keywords = keywordsParam
    ? keywordsParam.split(',').map(t => t.trim()).filter(Boolean)
    : JOOBLE_KEYWORDS
  const page = (req.query.page as string) || '1'

  const t0 = Date.now()
  let result
  try {
    result = await fetchJooble(process.env.JOOBLE_API_KEY || '', keywords, location, '50', page)
  } catch (e) {
    result = { jobs: [], rawCount: 0, error: String(e) }
  }

  return res.status(200).json({
    jobs: result.jobs.slice(0, 200),
    total: result.jobs.length,
    raw: result.rawCount,
    log: [
      {
        quelle: 'Jooble',
        anzahl: result.jobs.length,
        ms: Date.now() - t0,
        ok: !result.error,
        ...(result.error ? { fehler: result.error } : {}),
      },
    ],
    ts: new Date().toISOString(),
  })
}
