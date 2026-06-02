/**
 * Intelligence API Client
 * Verbindet das React-Frontend mit dem FastAPI Backend.
 */

const BASE = import.meta.env.VITE_INTELLIGENCE_API_URL || 'http://localhost:8000/api'

async function get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(BASE + path)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'PATCH' })
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  website: string
  city: string
  industry: string | null
  employee_range: string | null
  services: string[]
  score: number
  priority: 'A+' | 'A' | 'B' | 'C' | 'D'
  is_active: boolean
  last_enriched_at: string | null
  created_at: string
  career_pages?: { url: string; status: string; last_checked: string | null }[]
}

export interface IntelligenceJob {
  id: string
  titel: string
  unternehmen: string
  ort: string
  url: string
  score: number
  is_active: boolean
  company_id: string | null
  quelle: string
  beschreibung: string | null
  companies?: { name: string; industry: string; priority: string } | null
}

export interface Contact {
  id: string
  company_id: string
  name: string
  title: string | null
  source_url: string | null
  linkedin_url: string | null
}

export interface Project {
  id: string
  company_id: string
  project_type: string
  title: string
  location: string | null
  source_url: string | null
  project_date: string | null
  created_at: string
}

export interface Alert {
  id: string
  alert_type: string
  company_id: string | null
  job_id: string | null
  message: string
  is_read: boolean
  created_at: string
  companies?: { name: string } | null
}

export interface Stats {
  companies: number
  active_jobs: number
  unread_alerts: number
  pending_candidates: number
  queue: Record<string, number>
}

// ── API Calls ──────────────────────────────────────────────────

export const intelligenceApi = {
  // Stats
  getStats: () => get<Stats>('/stats'),

  // Companies
  getCompanies: (params?: {
    priority?: string
    industry?: string
    city?: string
    min_score?: number
    limit?: number
    offset?: number
  }) => get<{ data: Company[]; count: number }>('/companies', params as any),

  getCompany: (id: string) =>
    get<{ company: Company; jobs: IntelligenceJob[]; contacts: Contact[]; projects: Project[] }>(
      `/companies/${id}`
    ),

  // Jobs
  getJobs: (params?: { min_score?: number; company_id?: string; limit?: number }) =>
    get<{ data: IntelligenceJob[]; count: number }>('/jobs', params as any),

  // Alerts
  getAlerts: (unreadOnly = false) =>
    get<{ data: Alert[]; count: number }>('/alerts', { unread_only: unreadOnly }),

  markAlertRead: (id: string) => patch<{ ok: boolean }>(`/alerts/${id}/read`),

  // Queue
  getQueueStatus: () => get<Record<string, number>>('/queue/status'),

  triggerAgent: (agent: string, entityId?: string) =>
    post(`/queue/trigger/${agent}`, entityId ? { entity_id: entityId } : undefined),

  runDiscovery: () => post('/queue/run-discovery'),
}
