import { useState, useEffect, useCallback } from 'react'

export interface QuelleCount {
  quelle: string
  count: number
}

export interface CrawlRun {
  source: string
  started_at: string
  finished_at: string | null
  job_count: number
  new_count: number
  status: 'running' | 'done' | 'error'
  error?: string
}

export interface CrawlStatus {
  total: number
  by_quelle: QuelleCount[]
  last_crawls: Record<string, CrawlRun>
  ts: string
}

export function useCrawlStatus() {
  const [status, setStatus] = useState<CrawlStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/stats')
      if (r.ok) setStatus(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30_000)
    return () => clearInterval(iv)
  }, [refresh])

  // Ob irgendeiner der Crawler gerade läuft
  const isLive = status
    ? Object.values(status.last_crawls).some(r => r.status === 'running')
    : false

  // Zeitpunkt des letzten abgeschlossenen Crawls
  const lastFinished: string | null = status
    ? Object.values(status.last_crawls)
        .filter(r => r.finished_at)
        .map(r => r.finished_at!)
        .sort((a, b) => b.localeCompare(a))[0] ?? null
    : null

  return { status, loading, refresh, isLive, lastFinished }
}
