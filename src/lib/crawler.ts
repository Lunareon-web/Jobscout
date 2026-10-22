export interface CrawlResult {
  ok: boolean
  fetched?: number
  inserted?: number
  deleted?: number
  msg?: string
  error?: string
  by_source?: Record<string, number>
}

export type Status = 'idle' | 'running' | 'done' | 'error'

export interface SourceState {
  status: Status
  result?: CrawlResult
}

export const GEMINI_KEY_STORAGE = 'jobscout_gemini_key'

export const CRAWL_SOURCES = [
  { key: 'ba', label: 'Bundesagentur für Arbeit', desc: 'BA-API + KldB-Berufsgruppen', path: '/api/cron/ba', method: 'GET' },
  { key: 'portals', label: 'Portale (Jina + Gemini)', desc: 'Karriere · StepStone · Stellenanzeigen', path: '/api/cron/portals', method: 'POST' },
  { key: 'linkedin', label: 'LinkedIn', desc: 'Guest-Scraping via linkedin-jobs-api (kein Key)', path: '/api/cron/linkedin', method: 'GET' },
  { key: 'jooble', label: 'Jooble', desc: 'Jooble API (de.jooble.org)', path: '/api/cron/jooble', method: 'GET' },
  { key: 'firmenseiten', label: 'Firmenseiten', desc: 'ATS · JSON-LD · Jina + Gemini (JS-SPAs)', path: '/api/cron/firmenseiten', method: 'POST' },
  { key: 'discover', label: 'Neue Firmen entdecken', desc: 'Firmennamen aus BA → crawl_companies', path: '/api/cron/discover', method: 'GET' },
  { key: 'cleanup', label: 'Alte Stellen löschen (>30 Tage)', desc: 'Hard-Delete aus DB (täglich 07:00 auto)', path: '/api/cron/cleanup?max_tage=30', method: 'GET' },
]
