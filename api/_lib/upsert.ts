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

function hashStr(s: string): string {
  // cyrb53 — deterministischer Hash, damit gleiche Jobs immer gleiche IDs bekommen
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

function makeId(job: CrawledJob): string {
  // Volle URL hashen statt trunkieren: trunkierte URLs kollidieren
  // (alle BA-URLs teilen sich 41+ identische Prefix-Zeichen → Code 21000).
  const key = (job.url || `${job.titel}||${job.unternehmen}`).toLowerCase()
  const slug = key.replace(/[^a-z0-9]/g, '').slice(0, 40)
  return `${slug}_${hashStr(key)}`.slice(0, 64)
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
  // Intra-Batch-Dedup nach ID (Sicherheitsnetz gegen Code 21000)
  const byId = new Map<string, (typeof jobs)[number]>()
  jobs.forEach(j => {
    const tmp = { titel: j.titel, unternehmen: j.unternehmen, url: j.url } as CrawledJob
    byId.set(makeId(tmp), j)
  })
  const rows = [...byId.values()].map(j => ({
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
    if (error) throw new Error(`DB upsert error: ${error.message} (code: ${error.code})`)
    inserted += Math.min(50, rows.length - i)
  }
  return inserted
}

/**
 * Deaktiviert alte Stellen (is_active=false), damit sie nicht mehr
 * im Frontend auftauchen:
 * - datum älter als maxTage, oder
 * - datum leer UND found_at älter als maxTage (Direkt-Funde ohne Datum)
 * Gibt Anzahl deaktivierter Rows zurück.
 */
export async function deactivateOldJobs(maxTage = 30): Promise<number> {
  const cutoffDate = new Date(Date.now() - maxTage * 86_400_000)
    .toISOString()
    .slice(0, 10) // jobs.datum ist date
  const cutoffTs = new Date(Date.now() - maxTage * 86_400_000).toISOString()

  // 1. Jobs mit altem Veröffentlichungsdatum
  const r1 = await db
    .from('jobs')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('datum', 'is', null)
    .neq('datum', '')
    .lt('datum', cutoffDate)
    .select('id')

  // 2. Jobs ohne Datum, aber lange nicht mehr gefunden (Karteileichen)
  const r2 = await db
    .from('jobs')
    .update({ is_active: false })
    .eq('is_active', true)
    .or('datum.is.null,datum.eq.')
    .lt('found_at', cutoffTs)
    .select('id')

  return (r1.data?.length || 0) + (r2.data?.length || 0)
}
