import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Job, SearchLog, SearchConfig, SortOption, FilterCategory, SearchPhase
} from '../types'
import { deduplicateJobs } from '../lib/utils'

const DEFAULT_CONFIG: SearchConfig = {
  standort: 'Düsseldorf',
  umkreis: 50,
  maxTage: 15,
  jobtitel: [
    'Projektmanager', 'Project Manager', 'Design Manager',
    'Designer', 'Produktdesigner', 'Interior Designer',
    'Innenarchitekt', 'Raumplaner', 'Concept Designer',
    'Brand Designer', 'Visual Merchandiser',
  ],
}

interface AppState {
  // Jobs
  jobs: Job[]
  searchLog: SearchLog[]
  searchPhase: SearchPhase
  lastSearchAt: string | null

  // Favorites (persisted locally + synced to Supabase)
  favorites: Set<string>
  notes: Record<string, string>

  // UI
  filterQ: string
  sortBy: SortOption
  filterCategory: FilterCategory
  favoritesOnly: boolean
  currentPage: number

  // Config
  config: SearchConfig

  // Actions
  mergeJobs: (newJobs: Job[], log: SearchLog[]) => void
  setSearchPhase: (phase: SearchPhase) => void
  clearJobs: () => void
  toggleFavorite: (jobId: string) => void
  setNote: (jobId: string, note: string) => void
  setFilterQ: (q: string) => void
  setSortBy: (sort: SortOption) => void
  setFilterCategory: (cat: FilterCategory) => void
  setFavoritesOnly: (v: boolean) => void
  setCurrentPage: (page: number) => void
  setConfig: (config: Partial<SearchConfig>) => void

  // Derived
  getFilteredJobs: () => Job[]
  getCategoryCounts: () => Record<string, number>
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      jobs: [],
      searchLog: [],
      searchPhase: 'idle',
      lastSearchAt: null,
      favorites: new Set(),
      notes: {},
      filterQ: '',
      sortBy: 'date',
      filterCategory: 'all',
      favoritesOnly: false,
      currentPage: 1,
      config: DEFAULT_CONFIG,

      mergeJobs: (newJobs, log) => set(state => {
        const merged = deduplicateJobs([...state.jobs, ...newJobs])
        const mergedLog = [...state.searchLog]
        log.forEach(l => {
          const idx = mergedLog.findIndex(e => e.quelle === l.quelle)
          if (idx >= 0) mergedLog[idx] = l  // replace, don't accumulate
          else mergedLog.push(l)
        })
        return { jobs: merged, searchLog: mergedLog, lastSearchAt: new Date().toISOString() }
      }),

      setSearchPhase: phase => set({ searchPhase: phase }),

      clearJobs: () => set({ jobs: [], searchLog: [], searchPhase: 'idle' }),

      toggleFavorite: jobId => set(state => {
        const next = new Set(state.favorites)
        if (next.has(jobId)) next.delete(jobId)
        else next.add(jobId)
        return { favorites: next }
      }),

      setNote: (jobId, note) => set(state => ({
        notes: { ...state.notes, [jobId]: note }
      })),

      setFilterQ: q => set({ filterQ: q, currentPage: 1 }),
      setSortBy: sort => set({ sortBy: sort, currentPage: 1 }),
      setFilterCategory: cat => set({ filterCategory: cat, currentPage: 1 }),
      setFavoritesOnly: v => set({ favoritesOnly: v, currentPage: 1 }),
      setCurrentPage: page => set({ currentPage: page }),
      setConfig: config => set(state => ({ config: { ...state.config, ...config } })),

      getFilteredJobs: () => {
        const { jobs, filterQ, sortBy, filterCategory, favoritesOnly, favorites } = get()
        let src = [...jobs]

        if (favoritesOnly) src = src.filter(j => favorites.has(j.id))

        if (filterCategory === 'direkt') {
          src = src.filter(j => j.quelle.toLowerCase().includes('direkt'))
        } else if (filterCategory !== 'all') {
          src = src.filter(j => j.kategorie === filterCategory)
        }

        if (filterQ.trim()) {
          const q = filterQ.toLowerCase()
          src = src.filter(j =>
            [j.titel, j.unternehmen, j.ort, j.quelle, j.beschreibung]
              .join(' ').toLowerCase().includes(q)
          )
        }

        switch (sortBy) {
          case 'date':    src.sort((a, b) => new Date(b.datum || 0).getTime() - new Date(a.datum || 0).getTime()); break
          case 'title':   src.sort((a, b) => a.titel.localeCompare(b.titel, 'de')); break
          case 'company': src.sort((a, b) => a.unternehmen.localeCompare(b.unternehmen, 'de')); break
          case 'source':  src.sort((a, b) => a.quelle.localeCompare(b.quelle, 'de')); break
          case 'favorites': src.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id))); break
          case 'score':    src.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0)); break
        }

        return src
      },

      getCategoryCounts: () => {
        const { jobs } = get()
        const counts: Record<string, number> = { all: jobs.length, direkt: 0 }
        jobs.forEach(j => {
          counts[j.kategorie] = (counts[j.kategorie] || 0) + 1
          if (j.quelle.toLowerCase().includes('direkt')) counts.direkt++
        })
        return counts
      },
    }),
    {
      name: 'jobscout-storage',
      partialize: state => ({
        favorites: Array.from(state.favorites),
        notes: state.notes,
        config: state.config,
        jobs: state.jobs,
        searchLog: state.searchLog,
        lastSearchAt: state.lastSearchAt,
      }),
      onRehydrateStorage: () => state => {
        if (state && Array.isArray((state as any).favorites)) {
          state.favorites = new Set((state as any).favorites)
        }
      },
    }
  )
)
