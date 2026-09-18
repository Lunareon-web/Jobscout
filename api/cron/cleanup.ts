/**
 * Cron: Karteileichen endgültig löschen
 * Löscht Jobs aus Supabase, die älter als maxTage sind
 * (per datum, bzw. per found_at bei Jobs ohne Datum).
 * Favoriten hängen per ON DELETE CASCADE dran und werden mitgelöscht.
 * Läuft täglich via Vercel Cron (siehe vercel.json).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, deactivateOldJobs, deleteOldJobs } from '../_lib/upsert'

const DEFAULT_MAX_TAGE = 30

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const maxTage = Math.min(
    Math.max(parseInt((req.query.max_tage as string) || String(DEFAULT_MAX_TAGE)), 1),
    90,
  )
  const dry = (req.query.dry as string) === '1'
  const runId = await startCrawlRun('cleanup')

  let deactivated = 0
  let deleted = 0
  let dated = 0
  let dateless = 0
  let error: string | undefined
  try {
    // 1. Sicherheitsnetz: alles Alte zuerst deaktivieren (reversibel)
    deactivated = await deactivateOldJobs(maxTage)
    // 2. Endgültig löschen (irreversibel) — außer im Dry-Run (?dry=1)
    if (!dry) {
      const r = await deleteOldJobs(maxTage)
      deleted = r.deleted
      dated = r.dated
      dateless = r.dateless
    }
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, deleted, deleted, error ? 'error' : 'done', error)

  return res.status(200).json({
    ok: !error,
    source: 'cleanup',
    max_tage: maxTage,
    dry,
    deactivated,
    deleted,
    dated,
    dateless,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
