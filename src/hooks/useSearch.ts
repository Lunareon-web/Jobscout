import { useCallback } from 'react'
import { useStore } from '../store'
import { classifyJob } from '../lib/utils'
import type { Job, SearchLog } from '../types'

const BASE = import.meta.env.DEV ? 'http://localhost:3000' : ''

async function callSearchApi(path: string, params: Record<string, string>): Promise<{ jobs: Job[], log: SearchLog[] }> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/api/${path}?${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  // Attach category to each job
  const jobs: Job[] = (data.jobs || []).map((j: any) => ({
    ...j,
    id: j.id || `${j.titel}-${j.unternehmen}-${j.url}`.slice(0, 64),
    kategorie: classifyJob(j.titel),
  }))
  return { jobs, log: data.log || [] }
}

export function useSearch() {
  const { config, setSearchPhase, mergeJobs, clearJobs } = useStore()

  const startSearch = useCallback(async () => {
    // Don't clear — keep Supabase crawler jobs, merge manual results on top
    setSearchPhase('fast')

    const params = {
      standort: config.standort,
      umkreis: String(config.umkreis),
      max_tage: String(config.maxTage),
      jobtitel: config.jobtitel.join(','),
    }

    // Phase 1: BA API (fast, ~5s)
    try {
      const { jobs, log } = await callSearchApi('search-fast', params)
      mergeJobs(jobs, log)
    } catch (e) {
      console.error('Fast search failed:', e)
    }

    // Phase 2: Portals RSS + JSON-LD (~15s)
    setSearchPhase('portals')
    try {
      const { jobs, log } = await callSearchApi('search-portals', params)
      mergeJobs(jobs, log)
    } catch (e) {
      console.error('Portal search failed:', e)
    }

    // Phase 3: Firmenseiten direkt (~15s)
    setSearchPhase('firmen')
    try {
      const { jobs, log } = await callSearchApi('search-firmen', params)
      mergeJobs(jobs, log)
    } catch (e) {
      console.error('Firmen search failed:', e)
    }

    // Phase 4: LinkedIn via linkedin-jobs-api (~15s)
    setSearchPhase('linkedin')
    try {
      const { jobs, log } = await callSearchApi('search-linkedin', params)
      mergeJobs(jobs, log)
    } catch (e) {
      console.error('LinkedIn search failed:', e)
    }

    setSearchPhase('done')

    // Manuelle Treffer in Supabase persistieren, damit der 60s-DB-Reload
    // (setJobs/REPLACE) sie nicht wieder verwirft. Fehler nur loggen.
    try {
      const state = useStore.getState()
      if (state.jobs.length) {
        await fetch(`${BASE}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobs: state.jobs.slice(0, 500),
            config: state.config,
            log: state.searchLog,
          }),
        })
      }
    } catch (e) {
      console.error('Sync after search failed:', e)
    }
  }, [config, setSearchPhase, mergeJobs, clearJobs])

  return { startSearch }
}
