/**
 * Loads jobs from Supabase on mount.
 * - Includes jobs crawled by the Intelligence Backend
 * - Persists across page refreshes
 * - Merges into the same Zustand store as the manual search
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'
import { classifyJob } from '../lib/utils'
import type { Job, SearchLog } from '../types'

const SUPABASE_LOAD_LIMIT = 200

function mapRow(row: any): Job {
  return {
    id: row.id,
    titel: row.titel,
    unternehmen: row.unternehmen,
    ort: row.ort,
    plz: row.plz || '',
    datum: row.datum || '',
    url: row.url,
    quelle: row.quelle,
    beschreibung: row.beschreibung || '',
    arbeitszeit: row.arbeitszeit || '',
    kategorie: classifyJob(row.titel),
  }
}

export function useSupabaseJobs() {
  const { mergeJobs, jobs } = useStore()
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadFromSupabase = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(SUPABASE_LOAD_LIMIT)

      if (error) throw error
      if (!data?.length) return

      const mapped: Job[] = data.map(mapRow)
      const log: SearchLog[] = [{
        quelle: 'Supabase (Intelligence Crawler)',
        anzahl: mapped.length,
        ms: 0,
        ok: true,
      }]
      mergeJobs(mapped, log)
      setLoaded(true)
    } catch (e) {
      console.warn('Supabase load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // Load on mount if store is empty
  useEffect(() => {
    if (jobs.length === 0 && !loaded && !loading) {
      loadFromSupabase()
    }
  }, [])

  return { loadFromSupabase, loaded, loading }
}
