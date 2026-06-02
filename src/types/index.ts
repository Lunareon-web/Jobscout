export interface Job {
  id: string
  titel: string
  unternehmen: string
  ort: string
  plz: string
  datum: string // ISO date string
  url: string
  quelle: string
  beschreibung: string
  arbeitszeit: string
  kategorie: JobCategory
}

export type JobCategory = 'design' | 'interior' | 'architektur' | 'management' | 'sonstiges'

export interface SearchLog {
  quelle: string
  anzahl: number
  ms: number
  ok: boolean
  fehler?: string
}

export interface SearchResult {
  jobs: Job[]
  total: number
  raw: number
  log: SearchLog[]
  ts: string
}

export interface SearchConfig {
  standort: string
  umkreis: number
  maxTage: number
  jobtitel: string[]
}

export interface Favorite {
  id: string
  job_id: string
  user_id: string
  notiz: string
  created_at: string
  job?: Job
}

export interface SearchHistoryEntry {
  id: string
  user_id: string
  config: SearchConfig
  result_count: number
  created_at: string
}

export type SortOption = 'date' | 'title' | 'company' | 'source' | 'favorites'
export type FilterCategory = 'all' | JobCategory | 'direkt'
export type SearchPhase = 'idle' | 'fast' | 'portals' | 'firmen' | 'done' | 'error'
