/**
 * GET /api/search?source=fast|portals|firmen|linkedin|jooble
 * Sammelt alle Live-Suchquellen in EINER Serverless Function
 * (Vercel Hobby-Limit: max 12 Functions pro Deployment).
 * Die alten Pfade /api/search-{fast,portals,firmen,linkedin,jooble} werden
 * per vercel.json-Rewrite hierher umgeleitet — Frontend unverändert.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import fastHandler from './_lib/search-fast'
import portalsHandler from './_lib/search-portals'
import firmenHandler from './_lib/search-firmen'
import linkedinHandler from './_lib/search-linkedin'
import joobleHandler from './_lib/search-jooble'

const HANDLERS: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  fast: fastHandler,
  portals: portalsHandler,
  firmen: firmenHandler,
  linkedin: linkedinHandler,
  jooble: joobleHandler,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const source = String(req.query.source || '')
  const fn = HANDLERS[source]
  if (!fn) {
    return res.status(400).json({
      error: `Unknown source "${source}" — use ?source=fast|portals|firmen|linkedin|jooble`,
    })
  }
  return fn(req, res)
}
