/**
 * Cron: Firmenseiten direkt crawlen
 * Quellen: Supabase crawl_companies-Tabelle (dynamisch wachsend) + hardcoded Startliste
 * Strategien: Greenhouse API → Lever API → JSON-LD → __NEXT_DATA__ → Link-Scan
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { geminiUrl } from '../_lib/gemini'
import { stripHtml, safeFetch } from '../_lib/helpers'
import { db } from '../_lib/db'

const JOBTITEL_RE = new RegExp([
  'Designer', 'Innenarchitekt', 'Interior', 'Architekt', 'Raumplan',
  'Raumgestalter', 'Concept', 'Brand', 'Visual', 'Merchandis',
  'Manager', 'Projektleit', 'Projektmanager', 'Project', 'Bauleiter',
  'Kreativ', 'Director', 'Ladenbauer', 'Messe', 'Ausstellung',
  'Grafik', 'Marketing', 'Shopkonzept', 'Retail', 'Architect',
].join('|'), 'i')

const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
  'Accept-Language': 'de-DE,de;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// ── Hardcoded Startliste (Seed) ───────────────────────────────────────────────
// Diese werden automatisch in die crawl_companies-Tabelle übertragen falls noch nicht vorhanden

const SEED_FIRMEN: { name: string; career_url: string; city: string }[] = [
  { name: 'HPP Architekten',        career_url: 'https://www.hpp.com/de/karriere/',                                        city: 'Düsseldorf' },
  { name: 'RKW Architektur',        career_url: 'https://www.rkw-architektur.de/buero/karriere/',                          city: 'Düsseldorf' },
  { name: 'Ingenhoven Architects',  career_url: 'https://www.ingenhovenarchitects.com/studio/karriere/',                    city: 'Düsseldorf' },
  { name: 'Eller + Eller',          career_url: 'https://www.eller-eller.de/karriere/',                                    city: 'Düsseldorf' },
  { name: 'dart Architekten',       career_url: 'https://www.dart-architekten.de/buero/',                                  city: 'Düsseldorf' },
  { name: 'Blocher Partners',       career_url: 'https://www.blocherpartners.de/karriere/',                                city: 'Düsseldorf' },
  { name: 'Schweitzer Project',     career_url: 'https://www.schweitzer-project.com/karriere/',                           city: 'Düsseldorf' },
  { name: 'Materie',                career_url: 'https://www.materie.de/karriere/',                                       city: 'Düsseldorf' },
  { name: 'Kurz Design',            career_url: 'https://www.kurz-design.de/karriere/',                                   city: 'Neuss' },
  { name: 'Pieron Shopkonzepte',    career_url: 'https://www.pieron.de/unternehmen/karriere/',                            city: 'Neuss' },
  { name: 'CB.e Retail Solutions',  career_url: 'https://www.cbe-retail.com/karriere/',                                   city: 'Hilden' },
  { name: 'Umdasch Shop Concept',   career_url: 'https://www.umdasch-shop-concept.com/de/unternehmen/karriere/',          city: 'Neuss' },
  { name: 'Dula-Werke',             career_url: 'https://www.dula.de/karriere/',                                          city: 'Mönchengladbach' },
  { name: 'Syma-System',            career_url: 'https://www.syma.de/de/karriere/',                                       city: 'Meerbusch' },
  { name: 'Wöhner Design',          career_url: 'https://www.woehner-design.de/karriere/',                                city: 'Düsseldorf' },
  { name: 'Atelier Markgraph',      career_url: 'https://www.markgraph.de/karriere/',                                     city: 'Frankfurt' },
  { name: 'Raumwerk',               career_url: 'https://www.raumwerk.net/jobs/',                                         city: 'Frankfurt' },
  { name: 'HÜNNEBECK',              career_url: 'https://www.huennebeck.com/karriere/',                                   city: 'Ratingen' },
  { name: 'flora&faunavisions',     career_url: 'https://www.florafaunavisions.de/karriere/',                             city: 'Düsseldorf' },
  { name: 'OPUS Marketing',         career_url: 'https://www.opus-marketing.de/karriere/',                                city: 'Düsseldorf' },
  { name: 'Douglas',                career_url: 'https://karriere.douglas.de/stellenangebote/',                           city: 'Düsseldorf' },
  { name: 'Peek & Cloppenburg',     career_url: 'https://karriere.peek-cloppenburg.de/stellenangebote/',                  city: 'Düsseldorf' },
  { name: 'Lindner Hotels',         career_url: 'https://karriere.lindner.de/',                                           city: 'Düsseldorf' },
  { name: 'METRO',                  career_url: 'https://jobs.metro.com/de/de/search-results?m=20',                       city: 'Düsseldorf' },
  { name: 'C&A',                    career_url: 'https://www.c-and-a.com/de/de/corporate/company/karriere/',              city: 'Düsseldorf' },
  { name: 'Ogilvy Germany',         career_url: 'https://www.ogilvy.com/de/careers',                                     city: 'Düsseldorf' },
]

// ── ATS Detection ─────────────────────────────────────────────────────────────

type ATS = { type: 'greenhouse' | 'lever'; slug: string }

function detectATS(html: string): ATS | null {
  const gh = html.match(/boards(?:-api)?\.greenhouse\.io\/(?:v\d\/boards\/)?([a-z0-9_-]+)/i)
  if (gh) return { type: 'greenhouse', slug: gh[1] }
  const lv = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i)
  if (lv) return { type: 'lever', slug: lv[1] }
  return null
}

async function fetchGreenhouse(slug: string, firma: string, ort: string): Promise<CrawledJob[]> {
  const data = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {}, 10000)
  if (!data || data.trimStart().startsWith('<!DOCTYPE')) return []
  try {
    const json = JSON.parse(data)
    return (json.jobs || [])
      .filter((j: any) => JOBTITEL_RE.test(j.title || ''))
      .map((j: any) => ({
        titel: j.title || '',
        unternehmen: firma,
        ort: j.location?.name || ort,
        plz: '', datum: new Date().toISOString().slice(0, 10),
        url: j.absolute_url || '',
        quelle: `Direkt: ${firma}`,
        beschreibung: '',
        arbeitszeit: '',
        kategorie: classifyJob(j.title || ''),
      }))
  } catch { return [] }
}

async function fetchLever(slug: string, firma: string, ort: string): Promise<CrawledJob[]> {
  const data = await safeFetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {}, 10000)
  if (!data || data.trimStart().startsWith('<!DOCTYPE')) return []
  try {
    const json = JSON.parse(data)
    return (Array.isArray(json) ? json : [])
      .filter((j: any) => JOBTITEL_RE.test(j.text || ''))
      .map((j: any) => ({
        titel: j.text || '',
        unternehmen: firma,
        ort: j.categories?.location || ort,
        plz: '',
        datum: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : '',
        url: j.hostedUrl || '',
        quelle: `Direkt: ${firma}`,
        beschreibung: (j.descriptionPlain || '').slice(0, 200),
        arbeitszeit: '',
        kategorie: classifyJob(j.text || ''),
      }))
  } catch { return [] }
}

// ── HTML Parsing ───────────────────────────────────────────────────────────────

function parseJsonLd(html: string, firma: string, ort: string): CrawledJob[] {
  const jobs: CrawledJob[] = []
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      const items: any[] = Array.isArray(obj) ? obj : (obj['@graph'] || [obj])
      items.forEach(item => {
        if (item?.['@type'] !== 'JobPosting') return
        const titel = item.title || ''
        if (!titel) return
        jobs.push({
          titel,
          unternehmen: item.hiringOrganization?.name || firma,
          ort: item.jobLocation?.address?.addressLocality || ort,
          plz: item.jobLocation?.address?.postalCode || '',
          datum: item.datePosted || '',
          url: item.url || item['@id'] || '',
          quelle: `Direkt: ${firma}`,
          beschreibung: stripHtml(item.description || '').slice(0, 200),
          arbeitszeit: item.employmentType || '',
          kategorie: classifyJob(titel),
        })
      })
    } catch {}
  }
  return jobs
}

function parseNextData(html: string, firma: string, ort: string): CrawledJob[] {
  const jobs: CrawledJob[] = []
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]+?})<\/script>/)
  if (!m) return jobs
  try {
    const nd = JSON.parse(m[1])
    const paths = [
      ['props', 'pageProps', 'jobs'],
      ['props', 'pageProps', 'vacancies'],
      ['props', 'pageProps', 'positions'],
      ['props', 'pageProps', 'jobOffers'],
      ['props', 'pageProps', 'data', 'jobs'],
      ['props', 'pageProps', 'openPositions'],
    ]
    for (const path of paths) {
      let val: any = nd
      for (const key of path) val = val?.[key]
      if (!Array.isArray(val) || !val.length) continue
      val.forEach(item => {
        const titel = item.title || item.jobTitle || item.name || ''
        if (!titel) return
        jobs.push({
          titel,
          unternehmen: item.company || item.employer || firma,
          ort: item.location || item.city || ort,
          plz: item.postalCode || '',
          datum: item.datePosted || item.date || '',
          url: item.url || item.applyUrl || item.link || '',
          quelle: `Direkt: ${firma}`,
          beschreibung: stripHtml(item.teaser || item.description || '').slice(0, 200),
          arbeitszeit: item.employmentType || '',
          kategorie: classifyJob(titel),
        })
      })
      break
    }
  } catch {}
  return jobs
}

function parseLinkScan(html: string, firma: string, ort: string, baseUrl: string): CrawledJob[] {
  const jobs: CrawledJob[] = []
  const baseM = baseUrl.match(/^(https?:\/\/[^/]+)/)
  const aRe = /<a[^>]+href="([^"]{5,200})"[^>]*>([^<]{4,100})<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = aRe.exec(html)) !== null) {
    const txt = stripHtml(m[2])
    if (!JOBTITEL_RE.test(txt) || txt.length > 100) continue
    let href = m[1]
    if (!href.startsWith('http')) {
      if (baseM) href = baseM[1] + (href.startsWith('/') ? href : '/' + href)
    }
    if (!href.startsWith('http')) continue
    jobs.push({
      titel: txt, unternehmen: firma, ort, plz: '', datum: new Date().toISOString().slice(0, 10),
      url: href, quelle: `Direkt: ${firma}`, beschreibung: '', arbeitszeit: '',
      kategorie: classifyJob(txt),
    })
  }
  return jobs.slice(0, 8)
}

// ── Handler ────────────────────────────────────────────────────────────────────

// ── Jina + Gemini Fallback für JS-SPAs ───────────────────────────────────────

async function jinaFetch(url: string): Promise<string> {
  try {
    const r = await safeFetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown', 'X-Timeout': '20' }
    }, 25000)
    return r
  } catch { return '' }
}

async function geminiExtract(markdown: string, firma: string, careerUrl: string, apiKey: string): Promise<CrawledJob[]> {
  if (!markdown || !apiKey) return []
  const prompt = `Karriere-Seite von "${firma}". Extrahiere alle Stellenangebote für Design, Interior, Architektur, Retail, Marketing, Management, Projektmanagement.
Antworte NUR mit einem JSON-Array. Leeres Array [] wenn keine passenden Stellen:
[{"titel": "Jobtitel", "url": "https://...", "ort": "Stadt"}]
Falls keine URL: ${careerUrl}
Seite:\n${markdown.slice(0, 3500)}`

  try {
    const r = await fetch(
      geminiUrl(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!r.ok) return []
    const data = await r.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((j: any) => j.titel && JOBTITEL_RE.test(j.titel)).map((j: any) => ({
      titel: j.titel || '',
      unternehmen: firma,
      ort: j.ort || '',
      plz: '', datum: new Date().toISOString().slice(0, 10),
      url: j.url || careerUrl,
      quelle: `Direkt: ${firma}`,
      beschreibung: '', arbeitszeit: '',
      kategorie: classifyJob(j.titel || ''),
    })) : []
  } catch { return [] }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const geminiKey: string =
    (typeof req.body === 'object' ? req.body?.gemini_key : '') ||
    (req.headers['x-gemini-key'] as string) ||
    process.env.GEMINI_API_KEY ||
    ''
  const runId = await startCrawlRun('firmenseiten')

  // 1. Seed-Firmen in DB eintragen falls noch nicht vorhanden
  // Erst bekannte Namen laden, dann nur neue einfügen
  const { data: existingNames } = await db
    .from('crawl_companies').select('name').limit(2000)
  const knownSet = new Set((existingNames || []).map((r: any) => r.name.toLowerCase()))

  const newSeeds = SEED_FIRMEN.filter(f => !knownSet.has(f.name.toLowerCase()))
  const seedErrors: string[] = []
  for (const f of newSeeds) {
    const { error } = await db.from('crawl_companies').insert(
      { name: f.name, career_url: f.career_url, city: f.city, source: 'manual', is_active: true }
    )
    if (error) seedErrors.push(`${f.name}: ${error.message}`)
  }

  // 2. Alle aktiven Firmen mit career_url aus DB laden
  const { data: companyRows } = await db
    .from('crawl_companies')
    .select('id, name, career_url, city')
    .eq('is_active', true)
    .not('career_url', 'is', null)
    .order('last_crawled', { ascending: true, nullsFirst: true })
    .limit(20)  // max 20 pro Run — 60s Vercel-Timeout

  const crawl_companies = (companyRows || []) as { id: string; name: string; career_url: string; city: string }[]

  if (!crawl_companies.length) {
    return res.status(200).json({
      ok: seedErrors.length === 0,
      source: 'firmenseiten',
      msg: 'Keine Firmen in DB',
      seeds_attempted: newSeeds.length,
      seed_errors: seedErrors.slice(0, 3),
      inserted: 0,
    })
  }

  // 3. Alle Career Pages parallel laden (8s Timeout — Platz für Jina-Fallback)
  const htmlResults = await Promise.allSettled(
    crawl_companies.map(c => safeFetch(c.career_url, { headers: CRAWL_HEADERS }, 8000))
  )

  // 4. ATS-APIs parallel aufrufen wo erkannt
  const atsJobs = await Promise.allSettled(
    crawl_companies.map((c, i) => {
      const r = htmlResults[i]
      if (r.status !== 'fulfilled' || !r.value) return Promise.resolve([])
      const ats = detectATS(r.value)
      if (ats?.type === 'greenhouse') return fetchGreenhouse(ats.slug, c.name, c.city)
      if (ats?.type === 'lever')      return fetchLever(ats.slug, c.name, c.city)
      return Promise.resolve([])
    })
  )

  // 5. Jobs extrahieren
  const allJobs: CrawledJob[] = []
  const log: { firma: string; count: number; strategy: string }[] = []
  const crawledIds: string[] = []

  for (let i = 0; i < crawl_companies.length; i++) {
    const c = crawl_companies[i]
    const before = allJobs.length
    crawledIds.push(c.id)

    // ATS API hatte Ergebnisse
    const atsR = atsJobs[i]
    if (atsR.status === 'fulfilled' && atsR.value.length > 0) {
      allJobs.push(...atsR.value)
      log.push({ firma: c.name, count: atsR.value.length, strategy: 'ats-api' })
      continue
    }

    const htmlR = htmlResults[i]
    if (htmlR.status === 'rejected' || !htmlR.value) {
      log.push({ firma: c.name, count: 0, strategy: 'timeout' })
      continue
    }
    const html = htmlR.value

    // JSON-LD
    const jsonLd = parseJsonLd(html, c.name, c.city).filter(j => JOBTITEL_RE.test(j.titel))
    if (jsonLd.length) { allJobs.push(...jsonLd); log.push({ firma: c.name, count: jsonLd.length, strategy: 'json-ld' }); continue }

    // __NEXT_DATA__
    const next = parseNextData(html, c.name, c.city).filter(j => JOBTITEL_RE.test(j.titel))
    if (next.length) { allJobs.push(...next); log.push({ firma: c.name, count: next.length, strategy: 'next-data' }); continue }

    // Link-Scan
    const links = parseLinkScan(html, c.name, c.city, c.career_url)
    if (links.length) { allJobs.push(...links); log.push({ firma: c.name, count: links.length, strategy: 'link-scan' }); continue }

    log.push({ firma: c.name, count: 0, strategy: 'none' })
  }

  // 5b. Jina + Gemini für max. 3 Firmen ohne Ergebnis (JS-SPAs)
  if (geminiKey) {
    const noResult = crawl_companies
      .filter(c => !log.find(l => l.firma === c.name && l.count > 0))
      .slice(0, 3)
    for (const c of noResult) {
      const md = await jinaFetch(c.career_url)
      if (md) {
        const gjobs = await geminiExtract(md, c.name, c.career_url, geminiKey)
        if (gjobs.length) {
          allJobs.push(...gjobs)
          log.push({ firma: c.name, count: gjobs.length, strategy: 'jina-gemini' })
        }
      }
    }
  }

  // 6. last_crawled aktualisieren
  const now = new Date().toISOString()
  await db.from('crawl_companies')
    .update({ last_crawled: now })
    .in('id', crawledIds)

  // 7. Deduplizieren + speichern
  const seen = new Set<string>()
  const deduped = allJobs.filter(j => {
    if (!j.titel || j.titel.length < 3) return false
    const key = (j.url || `${j.titel}|${j.unternehmen}`).toLowerCase().replace(/\s/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let inserted = 0
  let error: string | undefined
  try { inserted = await upsertJobs(deduped); await deactivateOldJobs(30) } catch (e) { error = String(e) }

  if (runId) await finishCrawlRun(runId, deduped.length, inserted, error ? 'error' : 'done', error)

  const hits = log.filter(l => l.count > 0)
  return res.status(200).json({
    ok: !error,
    source: 'firmenseiten',
    crawl_companies_in_db: crawl_companies.length,
    crawl_companies_with_jobs: hits.length,
    hits,
    fetched: allJobs.length,
    deduped: deduped.length,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
