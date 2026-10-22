import { useState, useCallback } from 'react'
import { CRAWL_SOURCES, type SourceState } from '../lib/crawler'

const GEMINI_KEY_STORAGE = 'jobscout_gemini_key'

export function useCrawler() {
  const [states, setStates] = useState<Record<string, SourceState>>(
    Object.fromEntries(CRAWL_SOURCES.map(s => [s.key, { status: 'idle' }]))
  )
  const [running, setRunning] = useState(false)

  const set = (key: string, patch: Partial<SourceState>) =>
    setStates(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const runAll = useCallback(async () => {
    setRunning(true)
    const key = localStorage.getItem(GEMINI_KEY_STORAGE) || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key) headers['X-Gemini-Key'] = key

    CRAWL_SOURCES.forEach(s => set(s.key, { status: 'running', result: undefined }))

    await Promise.allSettled(
      CRAWL_SOURCES.map(async s => {
        try {
          const opts: RequestInit = { method: s.method, signal: AbortSignal.timeout(62_000) }
          if (s.method === 'POST') {
            opts.headers = { 'Content-Type': 'application/json' }
            opts.body = JSON.stringify({ gemini_key: key })
          }
          const r = await fetch(s.path, opts)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const result = await r.json()
          set(s.key, { status: result.ok !== false ? 'done' : 'error', result })
        } catch (e) {
          set(s.key, { status: 'error', result: { ok: false, error: String(e) } })
        }
      })
    )
    setRunning(false)
  }, [])

  const total = {
    fetched: Object.values(states).reduce((n, s) => n + (s.result?.fetched ?? 0), 0),
    inserted: Object.values(states).reduce((n, s) => n + (s.result?.inserted ?? 0), 0),
    deleted: Object.values(states).reduce((n, s) => n + (s.result?.deleted ?? 0), 0),
  }
  const anyDone = Object.values(states).some(s => s.status === 'done' || s.status === 'error')

  return { states, running, runAll, total, anyDone }
}
