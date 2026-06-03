import { db } from './db'
import type { JobKategorie } from './classify'

export interface CrawledJob {
  titel: string
  unternehmen: string
  ort: string
  plz?: string
  datum?: string
  url: string
  quelle: string
  beschreibung?: string
  arbeitszeit?: string
  kategorie: JobKategorie
}

function makeId(job: CrawledJob): string {
  // Stable, URL-based ID for deduplication
  const key = job.url || `${job.titel}||${job.unternehmen}`
  return key.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64)
}

export async function startCrawlRun(source: string): Promise<string | null> {
  try {
    const { data } = await db.from('crawl_runs').insert({ source }).select('id').single()
    return data?.id ?? null
  } catch { return null }
}

export async function finishCrawlRun(
  id: string,
  jobCount: number,
  newCount: number,
  status: 'done' | 'error',
  error?: string
): Promise<void> {
  try {
    await db.from('crawl_runs').update({
      finished_at: new Date().toISOString(),
      job_count: jobCount,
      new_count: newCount,
      status,
      ...(error ? { error } : {}),
    }).eq('id', id)
  } catch {}
}

export async function upsertJobs(jobs: CrawledJob[]): Promise<number> {
  if (!jobs.length) return 0
  const rows = jobs.map(j => ({
    id: makeId(j),
    titel: j.titel,
    unternehmen: j.unternehmen,
    ort: j.ort,
    plz: j.plz || null,
    datum: j.datum || null,
    url: j.url,
    quelle: j.quelle,
    beschreibung: j.beschreibung || null,
    arbeitszeit: j.arbeitszeit || null,
    kategorie: j.kategorie,
    is_active: true,
    found_at: new Date().toISOString(),
  }))

  let inserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db
      .from('jobs')
      .upsert(rows.slice(i, i + 50), { onConflict: 'id', ignoreDuplicates: false })
    if (!error) inserted += Math.min(50, rows.length - i)
  }
  return inserted
}
