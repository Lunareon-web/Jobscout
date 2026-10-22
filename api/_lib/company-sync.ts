/**
 * Unternehmen aus gefundenen Jobs automatisch erfassen.
 * - Legt neue Unternehmen in der `companies`-Tabelle an (mit Score + Priorität).
 * - Aktualisiert bestehende (Score nur steigend, last_enriched_at).
 * - Nimmt Unternehmen in `crawl_companies` auf, damit der Karriere-Seiten-Crawl
 *   deren Karriere-Seiten in späteren Läufen durchsucht.
 */
import { db } from './db'
import { computeCompanyScore, priorityFromScore } from './company-score'
import type { JobCategory } from '../types'

export interface CompanyCandidate {
  name: string
  city: string
  website: string | null
  jobs: Array<{ titel: string; beschreibung?: string; kategorie?: JobCategory; ort?: string; url?: string }>
  kategorie: JobCategory[]
}

/** Neue Jobs der letzten 24h laden und nach Unternehmen gruppieren. */
export async function loadNewCompanies(sinceHours = 24, limit = 5000): Promise<CompanyCandidate[]> {
  const since = new Date(Date.now() - sinceHours * 86_400_000).toISOString()

  const { data: jobs } = await db
    .from('jobs')
    .select('titel, unternehmen, ort, plz, url, quelle, beschreibung, kategorie, datum, found_at')
    .or('datum.is.null,datum.eq.')
    .gte('found_at', since)
    .order('found_at', { ascending: false })
    .limit(limit)

  if (!jobs?.length) return []

  const byCompany = new Map<string, CompanyCandidate>()
  for (const j of jobs) {
    const name = (j.unternehmen || '').trim()
    if (!name || name.length < 2) continue
    if (/^(nicht|anonym|n\. n\.|unbekannt|confidential|gmbh & co\. kg|ag)$/i.test(name)) continue

    const key = name.toLowerCase()
    if (!byCompany.has(key)) {
      byCompany.set(key, {
        name,
        city: j.ort || '',
        website: j.url ? originFromUrl(j.url) : null,
        jobs: [],
        kategorie: [],
      })
    }
    const c = byCompany.get(key)!
    c.jobs.push({
      titel: j.titel || '',
      beschreibung: j.beschreibung,
      kategorie: j.kategorie,
      ort: j.ort,
      url: j.url,
    })
    if (j.kategorie) c.kategorie.push(j.kategorie)
    if (j.ort && !c.city) c.city = j.ort
    if (!c.website && j.url) c.website = originFromUrl(j.url)
  }
  return [...byCompany.values()]
}

function originFromUrl(url: string): string | null {
  try { return new URL(url).origin } catch { return null }
}

/** Unternehmen upserten + in crawl_companies aufnehmen. Gibt { inserted, updated } zurück. */
export async function upsertCompanies(companies: CompanyCandidate[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0
  let updated = 0

  for (const c of companies) {
    const score = computeCompanyScore(c.jobs, c.kategorie)
    const priority = priorityFromScore(score)

    const { data: existing } = await db
      .from('companies')
      .select('id, score')
      .eq('name', c.name)
      .maybeSingle()

    if (existing) {
      // Bestehendes: Score nur steigend, Priorität + letztes Anreichern aktualisieren
      await db
        .from('companies')
        .update({
          score: Math.max(existing.score, score),
          priority,
          last_enriched_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      updated++
    } else {
      // Neues Unternehmen anlegen
      await db.from('companies').insert({
        name: c.name,
        website: c.website || null,
        city: c.city || null,
        industry: c.kategorie[0] || null,
        score,
        priority,
        is_active: true,
        last_enriched_at: new Date().toISOString(),
      })
      inserted++
    }

    // In crawl_companies aufnehmen → Karriere-Seiten-Crawl findet die Firma später automatisch
    if (c.website) {
      await db
        .from('crawl_companies')
        .upsert(
          { name: c.name, career_url: c.website, city: c.city || null, source: 'jobs-sync', is_active: true },
          { onConflict: 'name' },
        )
        .catch(() => { /* Tabelle existiert ggf. noch nicht — ignorieren */ })
    }
  }

  return { inserted, updated }
}

/** Komplett-Lauf: neue Jobs laden → Unternehmen upserten. */
export async function syncNewCompanies(sinceHours = 24, limit = 5000): Promise<{
  ok: boolean
  processed: number
  companies: number
  inserted: number
  updated: number
  error?: string
}> {
  try {
    const companies = await loadNewCompanies(sinceHours, limit)
    const result = await upsertCompanies(companies)
    return {
      ok: true,
      processed: companies.reduce((s, c) => s + c.jobs.length, 0),
      companies: companies.length,
      ...result,
    }
  } catch (e) {
    return { ok: false, processed: 0, companies: 0, inserted: 0, updated: 0, error: String(e) }
  }
}
