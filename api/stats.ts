/**
 * GET /api/stats
 * Gibt Gesamtanzahl, Anzahl pro Quelle und letzte Crawl-Runs zurück.
 * Wird vom Frontend alle 30s gepollt für den Live-Status.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=60')

  const [countRes, quelleRes, runsRes] = await Promise.allSettled([
    // Gesamtanzahl aktiver Jobs
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
    // Anzahl pro Quelle (max 2000 Rows für Counting)
    db.from('jobs').select('quelle').eq('is_active', true).limit(2000),
    // Letzte Crawl-Runs pro Source
    db.from('crawl_runs')
      .select('source, started_at, finished_at, job_count, new_count, status, error')
      .order('started_at', { ascending: false })
      .limit(30),
  ])

  const total = countRes.status === 'fulfilled' ? (countRes.value.count ?? 0) : 0

  // Zählen pro Quelle
  const quelleCount: Record<string, number> = {}
  if (quelleRes.status === 'fulfilled' && quelleRes.value.data) {
    quelleRes.value.data.forEach((row: any) => {
      const q = row.quelle || 'Unbekannt'
      quelleCount[q] = (quelleCount[q] || 0) + 1
    })
  }

  const by_quelle = Object.entries(quelleCount)
    .sort((a, b) => b[1] - a[1])
    .map(([quelle, count]) => ({ quelle, count }))

  // Letzter Run pro Crawler-Source
  const last_crawls: Record<string, any> = {}
  if (runsRes.status === 'fulfilled' && runsRes.value.data) {
    for (const run of runsRes.value.data) {
      if (!last_crawls[run.source]) last_crawls[run.source] = run
    }
  }

  return res.status(200).json({
    total,
    by_quelle,
    last_crawls,
    ts: new Date().toISOString(),
  })
}
