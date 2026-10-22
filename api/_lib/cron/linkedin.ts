/**
 * Cron: LinkedIn via linkedin-jobs-api (Guest-Scraping, kein Key nÃ¶tig).
 * LÃ¤uft tÃ¤glich via Vercel Cron (siehe vercel.json).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs } from '../../_lib/upsert'
import {
  fetchLinkedIn,
  dedupeFilterLinkedIn,
  LINKEDIN_JOBTITEL_DEFAULT,
} from '../../_lib/linkedin'

const STANDORT = 'DÃ¼sseldorf'
const MAX_TAGE = 30

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const runId = await startCrawlRun('linkedin')

  let fetched = 0
  let dedupedCount = 0
  let inserted = 0
  let perTitle: Record<string, number> = {}
  let error: string | undefined

  try {
    const r = await fetchLinkedIn(LINKEDIN_JOBTITEL_DEFAULT, STANDORT, MAX_TAGE)
    fetched = r.jobs.length
    perTitle = r.perTitle
    const deduped = dedupeFilterLinkedIn(r.jobs, MAX_TAGE)
    dedupedCount = deduped.length
    inserted = await upsertJobs(deduped)
    await deactivateOldJobs(MAX_TAGE)
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, dedupedCount, inserted, error ? 'error' : 'done', error)

  return res.status(200).json({
    ok: !error,
    source: 'linkedin',
    fetched,
    deduped: dedupedCount,
    inserted,
    per_title: perTitle,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}


