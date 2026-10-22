/**
 * GET /api/search-jooble
 * Live-Suche: Jooble (de.jooble.org, POST, Key serverseitig via VITE_JOOBLE_API_KEY).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { CrawledJob } from './_lib/upsert'
import { fetchJooble, JOOBLE_KEYWORDS } from './_lib/jooble'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const location = (req.query.location as string) || 'Düsseldorf'
  const keywordsParam = req.query.keywords as string
  const keywords = keywordsParam
    ? keywordsParam.split(',').map(t => t.trim()).filter(Boolean)
    : JOOBLE_KEYWORDS
  const page = (req.query.page as string) || '1'

  const t0 = Date.now()
  let jobs: CrawledJob[] = []
  let rawCount = 0
  let ok = true
  let fehler: string | undefined
  try {
    const r = await fetchJooble(process.env.JOOBLE_API_KEY || '', keywords, location, '50', page)
    jobs = r.jobs
    rawCount = r.rawCount
    if (r.error) { ok = false; fehler = r.error }
  } catch (e) {
    ok = false
    fehler = String(e)
  }

  return res.status(200).json({
    jobs: jobs.slice(0, 200),
    total: jobs.length,
    raw: rawCount,
    log: [
      {
        quelle: 'Jooble',
        anzahl: jobs.length,
        ms: Date.now() - t0,
        ok,
        ...(fehler ? { fehler } : {}),
      },
    ],
    ts: new Date().toISOString(),
  })
}
