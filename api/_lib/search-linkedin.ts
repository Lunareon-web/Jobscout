import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  fetchLinkedIn,
  dedupeFilterLinkedIn,
  LINKEDIN_JOBTITEL_DEFAULT,
} from './linkedin'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const standort = (req.query.standort as string) || 'Düsseldorf'
  const maxTage = parseInt((req.query.max_tage as string) || '15')
  const jobtitelParam = req.query.jobtitel as string
  const jobtitel = jobtitelParam
    ? jobtitelParam.split(',').map(t => t.trim()).filter(Boolean)
    : LINKEDIN_JOBTITEL_DEFAULT

  const t0 = Date.now()
  let jobs: Awaited<ReturnType<typeof fetchLinkedIn>>['jobs'] = []
  let perTitle: Record<string, number> = {}
  let ok = true
  let fehler: string | undefined
  try {
    const r = await fetchLinkedIn(jobtitel, standort, maxTage)
    jobs = r.jobs
    perTitle = r.perTitle
  } catch (e) {
    ok = false
    fehler = String(e)
  }

  const deduped = dedupeFilterLinkedIn(jobs, maxTage)

  return res.status(200).json({
    jobs: deduped.slice(0, 200),
    total: deduped.length,
    raw: jobs.length,
    log: [
      {
        quelle: 'LinkedIn',
        anzahl: deduped.length,
        ms: Date.now() - t0,
        ok,
        ...(fehler ? { fehler } : {}),
      },
    ],
    per_title: perTitle,
    ts: new Date().toISOString(),
  })
}
