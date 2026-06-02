/**
 * Loads jobs from Supabase (Intelligence Crawler results).
 * Replaces the store's supabase-sourced jobs on each load
 * rather than merging/deduplicating — keeps count accurate.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'
import { classifyJob } from '../lib/utils'
import type { Job, SearchLog } from '../types'

const SUPABASE_LOAD_LIMIT = 1000

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
  const { mergeJobs } = useStore()
  const [loading, setLoading] = useState(false)
  const [dbCount, setDbCount] = useState(0)

  const loadFromSupabase = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(SUPABASE_LOAD_LIMIT)

      if (error) throw error
      const count = data?.length || 0
      setDbCount(count)
      if (!count) return

      const mapped: Job[] = data!.map(mapRow)

      // Replace the supabase log entry (don't accumulate)
      const log: SearchLog[] = [{
        quelle: 'Supabase (Intelligence Crawler)',
        anzahl: count,
        ms: 0,
        ok: true,
      }]
      mergeJobs(mapped, log)
    } catch (e) {
      console.warn('Supabase load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // Load on mount + auto-refresh every 5 minutes
  useEffect(() => {
    loadFromSupabase()
    const iv = setInterval(loadFromSupabase, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  return { loadFromSupabase, loading, dbCount }
}
