/**
 * Company Discovery Agent
 * Liest neue Unternehmen aus BA-Job-Ergebnissen,
 * sucht deren Career-Page und speichert sie in der companies-Tabelle.
 * Je mehr Crawls laufen, desto mehr Unternehmen werden entdeckt.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_lib/db'
import { safeFetch } from '../_lib/helpers'

const BA_API   = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4'
const BA_KEY   = 'jobboerse-jobsuche'
const MAX_NEW  = 30  // max neue Firmen pro Durchlauf (Rate-Limit Schutz)

// ── BA Job-Detail: liefert ggf. Firmen-URL ──────────────────────────────────

async function fetchBADetail(hashId: string): Promise<{ website?: string; city?: string } | null> {
  try {
    const r = await fetch(`${BA_API}/jobdetails/${hashId}`, {
      headers: { 'X-API-Key': BA_KEY },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = await r.json()
    const website = d?.stellenangebot?.arbeitgeberdarstellung?.homepageUrl
      || d?.stellenangebot?.arbeitgeber?.homepageUrl
      || d?.homepageUrl
      || null
    const city = d?.stellenangebot?.arbeitsort?.ort || null
    return { website: website || undefined, city: city || undefined }
  } catch { return null }
}

// ── Career-Page finden ────────────────────────────────────────────────────────

const CAREER_PATHS = [
  '/karriere', '/karriere/', '/jobs', '/jobs/', '/stellenangebote',
  '/stellenangebote/', '/career', '/career/', '/about/career',
  '/unternehmen/karriere', '/ueber-uns/jobs', '/arbeiten-bei-uns',
]

async function findCareerPage(website: string): Promise<string | null> {
  const base = website.replace(/\/$/, '')
  // Homepage checken — enthält sie direkt einen Karriere-Abschnitt?
  const html = await safeFetch(base, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE' },
  }, 8000)
  if (!html) return null

  // Karriere-Link im HTML finden
  const karriereRe = /href="((?:https?:\/\/[^"]*)?(?:\/karriere|\/jobs|\/stellenangebote|\/career)[^"]*?)"/i
  const match = html.match(karriereRe)
  if (match) {
    const href = match[1]
    return href.startsWith('http') ? href : base + href
  }

  // Bekannte Pfade ausprobieren
  for (const path of CAREER_PATHS) {
    const url = base + path
    const r = await safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 5000)
    if (r && r.length > 1000 && !r.includes('404') && !r.includes('Seite nicht gefunden')) {
      return url
    }
  }
  return null
}

// ── Domain aus Firmenname ableiten ────────────────────────────────────────────

function slugFromName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+gmbh.*$/i, '').replace(/\s+ag.*$/i, '').replace(/\s+kg.*$/i, '')
    .replace(/[äáà]/g, 'ae').replace(/[öó]/g, 'oe').replace(/[üú]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function guessWebsite(name: string): Promise<string | null> {
  const slug = slugFromName(name)
  const candidates = [
    `https://www.${slug}.de`,
    `https://www.${slug}.com`,
    `https://${slug}.de`,
  ]
  for (const url of candidates) {
    const r = await safeFetch(url, {}, 5000)
    if (r && r.length > 500 && !r.includes('NXDOMAIN')) return url
  }
  return null
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // 1. Bekannte Firmennamen aus companies-Tabelle laden
  const { data: existing } = await db
    .from('companies')
    .select('name')
    .limit(2000)

  const knownNames = new Set((existing || []).map((r: any) => r.name.toLowerCase()))

  // 2. Neue Firmennamen aus jobs-Tabelle (letzten 14 Tage, BA-Quelle)
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data: jobRows } = await db
    .from('jobs')
    .select('unternehmen, ort, quelle, url')
    .gte('found_at', since)
    .neq('unternehmen', '')
    .limit(2000)

  if (!jobRows?.length) {
    return res.status(200).json({ ok: true, discovered: 0, msg: 'Keine neuen Jobs gefunden' })
  }

  // Unique Firmennamen die noch nicht bekannt sind
  const candidateMap: Map<string, { name: string; city: string; url: string }> = new Map()
  for (const row of jobRows) {
    const name = (row.unternehmen || '').trim()
    if (!name || name.length < 3) continue
    if (knownNames.has(name.toLowerCase())) continue
    if (!candidateMap.has(name.toLowerCase())) {
      candidateMap.set(name.toLowerCase(), { name, city: row.ort || '', url: row.url || '' })
    }
  }

  const candidates = [...candidateMap.values()].slice(0, MAX_NEW)
  if (!candidates.length) {
    return res.status(200).json({ ok: true, discovered: 0, msg: 'Alle Firmen bereits bekannt' })
  }

  // 3. Für jede neue Firma: Website + Career-Page finden
  const discovered: { name: string; career_url: string | null; website: string | null }[] = []

  // BA Detail-IDs aus den Job-URLs extrahieren
  const baJobs = jobRows.filter(r => (r.quelle || '').includes('Bundesagentur'))
  const hashIdMap: Map<string, string> = new Map()
  for (const job of baJobs) {
    const m = job.url?.match(/jobdetail\/([A-Za-z0-9_-]+)/)
    if (m && job.unternehmen) hashIdMap.set(job.unternehmen.toLowerCase(), m[1])
  }

  // Parallel verarbeiten (max 5 gleichzeitig um Rate-Limits zu vermeiden)
  const BATCH = 5
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(async c => {
      let website: string | null = null
      let career_url: string | null = null

      // Strategie 1: BA Detail-API
      const hashId = hashIdMap.get(c.name.toLowerCase())
      if (hashId) {
        const detail = await fetchBADetail(hashId)
        if (detail?.website) website = detail.website
      }

      // Strategie 2: Domain aus Name ableiten
      if (!website) {
        website = await guessWebsite(c.name)
      }

      // Career-Page suchen
      if (website) {
        career_url = await findCareerPage(website)
      }

      return { name: c.name, city: c.city, website, career_url, source: 'ba' as const }
    }))

    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const { name, city, website, career_url, source } = r.value
      discovered.push({ name, career_url, website })

      // In Supabase speichern
      await db.from('companies').insert({
        name,
        website: website || null,
        career_url: career_url || null,
        city: city || null,
        source,
        is_active: true,
      }).select()
    }
  }

  const withCareer = discovered.filter(d => d.career_url).length

  return res.status(200).json({
    ok: true,
    candidates: candidates.length,
    discovered: discovered.length,
    with_career_page: withCareer,
    new_companies: discovered.map(d => ({
      name: d.name,
      career_url: d.career_url,
      has_website: !!d.website,
    })),
    ts: new Date().toISOString(),
  })
}
