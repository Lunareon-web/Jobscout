/**
 * Cron: Karteileichen deaktivieren
 * Setzt jobs.is_active=false für Stellen älter als maxTage.
 * Läuft täglich via Vercel Cron (siehe vercel.json).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, deactivateOldJobs } from '../_lib/upsert'

const DEFAULT_MAX_TAGE = 30

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const maxTage = Math.min(
    Math.max(parseInt((req.query.max_tage as string) || String(DEFAULT_MAX_TAGE)), 1),
    90,
  )
  const runId = await startCrawlRun('cleanup')

  let deactivated = 0
  let error: string | undefined
  try {
    deactivated = await deactivateOldJobs(maxTage)
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, deactivated, deactivated, error ? 'error' : 'done', error)

  return res.status(200).json({
    ok: !error,
    source: 'cleanup',
    max_tage: maxTage,
    deactivated,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
