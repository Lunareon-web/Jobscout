/**
 * Cron-Dispatcher: alle Cron-Jobs in EINER Serverless Function
 * (Vercel Hobby-Limit: max 12 Functions pro Deployment).
 * Aufruf: GET /api/cron?source=ba|portals|linkedin|firmenseiten|cleanup|discover|jooble
 * Die alten Pfade /api/cron/<quelle> werden per vercel.json-Rewrite hierher umgeleitet.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import baHandler from './_lib/cron/ba'
import portalsHandler from './_lib/cron/portals'
import linkedinHandler from './_lib/cron/linkedin'
import firmenseitenHandler from './_lib/cron/firmenseiten'
import cleanupHandler from './_lib/cron/cleanup'
import discoverHandler from './_lib/cron/discover'
import joobleHandler from './_lib/cron/jooble'

const HANDLERS: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  ba: baHandler,
  portals: portalsHandler,
  linkedin: linkedinHandler,
  firmenseiten: firmenseitenHandler,
  cleanup: cleanupHandler,
  discover: discoverHandler,
  jooble: joobleHandler,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const source = String(req.query.source || '')
  const fn = HANDLERS[source]
  if (!fn) {
    return res.status(400).json({
      error: `Unknown cron source "${source}" — use ?source=ba|portals|linkedin|firmenseiten|cleanup|discover|jooble`,
    })
  }
  return fn(req, res)
}
