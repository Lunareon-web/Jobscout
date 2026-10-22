/**
 * Loads jobs from Supabase (Intelligence Crawler results).
 * Replaces the store's supabase-sourced jobs on each load
 * rather than merging/deduplicating — keeps count accurate.
 */
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
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
    found_at: row.found_at || undefined,
    created_at: row.created_at || undefined,
  }
}

export function useSupabaseJobs() {
  const { setJobs, searchPhase } = useStore()
  const [loading, setLoading] = useState(false)
  const [dbCount, setDbCount] = useState(0)
  const [dbError, setDbError] = useState<string | null>(
    isSupabaseConfigured ? null : 'Supabase nicht konfiguriert',
  )

  const loadFromSupabase = async () => {
    // Während einer manuellen Suche nicht laden — sonst würden die gerade
    // gefundenen Ergebnisse durch den DB-Reload überschrieben.
    if (searchPhase !== 'idle') {
      return
    }
    if (!isSupabaseConfigured) {
      setDbError('Supabase nicht konfiguriert')
      return
    }
    setLoading(true)
    setDbError(null)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_active', true)
        .order('found_at', { ascending: false })
        .limit(SUPABASE_LOAD_LIMIT)

      if (error) throw error
      const count = data?.length || 0
      setDbCount(count)
      if (!count) return

      const mapped: Job[] = data!.map(mapRow)

      // REPLACE jobs entirely — don't merge/dedup with stale localStorage data
      const log: SearchLog[] = [{
        quelle: 'Supabase (Intelligence Crawler)',
        anzahl: count,
        ms: 0,
        ok: true,
      }]
      setJobs(mapped, log)
    } catch (e) {
      console.warn('Supabase load failed:', e)
      setDbError('Datenbank-Ladefehler')
    } finally {
      setLoading(false)
    }
  }

  // Load on mount + auto-refresh every 60 seconds
  // Hinweis: nur EINE Instanz mounten (App.tsx) — Topbar bekommt loadFromSupabase als Prop,
  // sonst doppelte Queries alle 30s.
  useEffect(() => {
    loadFromSupabase()
    const iv = setInterval(loadFromSupabase, 60_000)
    return () => clearInterval(iv)
  }, [searchPhase])

  return { loadFromSupabase, loading, dbCount, dbError }
}
