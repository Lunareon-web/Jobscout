/**
 * Cron: Jooble via de.jooble.org API (POST, Key serverseitig).
 * LÃ¤uft tÃ¤glich via Vercel Cron (siehe vercel.json).
 * Hinweis: Freier Key hat 500-Anfrage-Lifetime-Gesamtlimit â€” sparsam nutzen (1Ã— tÃ¤glich).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs } from '../../_lib/upsert'
import { fetchJooble, JOOBLE_KEYWORDS } from '../../_lib/jooble'

const STANDORT = 'DÃ¼sseldorf'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const runId = await startCrawlRun('jooble')

  let fetched = 0
  let inserted = 0
  let error: string | undefined

  try {
    const r = await fetchJooble(process.env.JOOBLE_API_KEY || '', JOOBLE_KEYWORDS, STANDORT, '50', '1')
    fetched = r.jobs.length
    inserted = await upsertJobs(r.jobs)
    await deactivateOldJobs(30)
    if (r.error) error = r.error
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, fetched, inserted, error ? 'error' : 'done', error)

  return res.status(200).json({
    ok: !error,
    source: 'jooble',
    fetched,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}


