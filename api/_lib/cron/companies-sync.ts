/**
 * Cron: Neue Unternehmen aus den letzten Job-Ausschreibungen erfassen.
 * Legt Firmen mit Score + Priorität in `companies` an und nimmt sie in
 * `crawl_companies` auf, damit der Karriere-Seiten-Crawl sie später durchsucht.
 *
 * Aufruf: GET /api/cron?source=companies-sync
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { syncNewCompanies } from '../_lib/company-sync'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const sinceHours = Math.min(Math.max(parseInt((req.query.since_hours as string) || '24'), 1), 168)
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '5000'), 100), 10000)

  const result = await syncNewCompanies(sinceHours, limit)

  return res.status(200).json({
    ok: result.ok,
    source: 'companies-sync',
    since_hours: sinceHours,
    ...result,
    ts: new Date().toISOString(),
    ...(result.error ? { error: result.error } : {}),
  })
}
