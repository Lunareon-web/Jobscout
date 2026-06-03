/**
 * Cron: Firmenseiten direkt crawlen
 * Strategien: Greenhouse API → Lever API → JSON-LD → __NEXT_DATA__ → Link-Scan
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { XMLParser } from 'fast-xml-parser'
import { startCrawlRun, finishCrawlRun, upsertJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { stripHtml, safeFetch } from '../_lib/helpers'

const JOBTITEL_RE = new RegExp([
  'Designer', 'Innenarchitekt', 'Interior', 'Architekt', 'Raumplan',
  'Raumgestalter', 'Concept', 'Brand', 'Visual', 'Merchandise',
  'Manager', 'Projektleit', 'Projektmanager', 'Project', 'Bauleiter',
  'Kreativ', 'Director', 'Ladenbauer', 'Messe', 'Ausstellung',
  'Grafik', 'Marketing', 'Shopkonzept', 'Retail',
].join('|'), 'i')

const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
  'Accept-Language': 'de-DE,de;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// ── Firmenliste ───────────────────────────────────────────────────────────────
// greenhouse_slug / lever_slug: leer lassen wenn unbekannt, wird aus HTML erkannt

const FIRMEN: {
  name: string
  url: string
  ort: string
  greenhouse?: string
  lever?: string
}[] = [
  // Architektur Düsseldorf
  { name: 'HPP Architekten',        url: 'https://www.hpp.com/de/karriere/',                                        ort: 'Düsseldorf' },
  { name: 'RKW Architektur',        url: 'https://www.rkw-architektur.de/buero/karriere/',                          ort: 'Düsseldorf' },
  { name: 'Ingenhoven Architects',  url: 'https://www.ingenhovenarchitects.com/studio/karriere/',                    ort: 'Düsseldorf' },
  { name: 'Eller + Eller',          url: 'https://www.eller-eller.de/karriere/',                                    ort: 'Düsseldorf' },
  { name: 'dart Architekten',       url: 'https://www.dart-architekten.de/buero/',                                  ort: 'Düsseldorf' },
  { name: 'Winking Froh Architekten', url: 'https://www.winking-froh.de/buero/jobs/',                              ort: 'Düsseldorf' },
  { name: 'JSWD Architekten',       url: 'https://www.jswd-architekten.de/buero/karriere/',                        ort: 'Köln' },
  { name: 'schneider+schumacher',   url: 'https://www.schneider-schumacher.de/aktuelles/jobs/',                    ort: 'Frankfurt' },
  // Interior / Shop / Retail Design
  { name: 'Blocher Partners',       url: 'https://www.blocherpartners.de/karriere/',                                ort: 'Düsseldorf' },
  { name: 'Schweitzer Project',     url: 'https://www.schweitzer-project.com/karriere/',                           ort: 'Düsseldorf' },
  { name: 'Materie',                url: 'https://www.materie.de/karriere/',                                       ort: 'Düsseldorf' },
  { name: 'Kurz Design',            url: 'https://www.kurz-design.de/karriere/',                                   ort: 'Neuss' },
  { name: 'Pieron Shopkonzepte',    url: 'https://www.pieron.de/unternehmen/karriere/',                            ort: 'Neuss' },
  { name: 'CB.e Retail Solutions',  url: 'https://www.cbe-retail.com/karriere/',                                   ort: 'Hilden' },
  { name: 'Umdasch Shop Concept',   url: 'https://www.umdasch-shop-concept.com/de/unternehmen/karriere/',          ort: 'Neuss' },
  { name: 'Dula-Werke',             url: 'https://www.dula.de/karriere/',                                          ort: 'Mönchengladbach' },
  { name: 'Syma-System',            url: 'https://www.syma.de/de/karriere/',                                       ort: 'Meerbusch' },
  { name: 'Wöhner Design',          url: 'https://www.woehner-design.de/karriere/',                                ort: 'Düsseldorf' },
  { name: 'Atelier Markgraph',      url: 'https://www.markgraph.de/karriere/',                                     ort: 'Frankfurt' },
  { name: 'Raumwerk',               url: 'https://www.raumwerk.net/jobs/',                                         ort: 'Frankfurt' },
  // Messe & Events
  { name: 'HÜNNEBECK',              url: 'https://www.huennebeck.com/karriere/',                                   ort: 'Ratingen' },
  { name: 'flora&faunavisions',     url: 'https://www.florafaunavisions.de/karriere/',                             ort: 'Düsseldorf' },
  // Agenturen & Marketing Düsseldorf
  { name: 'OPUS Marketing',         url: 'https://www.opus-marketing.de/karriere/',                                ort: 'Düsseldorf' },
  { name: 'BBDO Germany',           url: 'https://www.bbdo.de/de/karriere/',                                       ort: 'Düsseldorf' },
  { name: 'GREY Worldwide',         url: 'https://www.grey.com/de/karriere/',                                      ort: 'Düsseldorf' },
  { name: 'Ogilvy Germany',         url: 'https://www.ogilvy.com/de/careers',                                     ort: 'Düsseldorf' },
  // Retail & Fashion
  { name: 'Douglas',                url: 'https://karriere.douglas.de/stellenangebote/',                           ort: 'Düsseldorf' },
  { name: 'Peek & Cloppenburg',     url: 'https://karriere.peek-cloppenburg.de/stellenangebote/',                  ort: 'Düsseldorf' },
  { name: 'Lindner Hotels',         url: 'https://karriere.lindner.de/',                                           ort: 'Düsseldorf' },
  { name: 'METRO',                  url: 'https://jobs.metro.com/de/de/search-results?m=20',                       ort: 'Düsseldorf', greenhouse: 'metro' },
  { name: 'C&A',                    url: 'https://www.c-and-a.com/de/de/corporate/company/karriere/',              ort: 'Düsseldorf' },
  { name: 'Esprit',                 url: 'https://www.esprit.com/de-de/service/jobs/',                             ort: 'Düsseldorf' },
  // Sonstige relevante Firmen NRW
  { name: 'Henkel AG',              url: 'https://careers.henkel.com/jobs?location=Düsseldorf',                    ort: 'Düsseldorf' },
  { name: 'REWE Group',             url: 'https://rewegroup.jobs/stellenangebote/?location=Köln',                  ort: 'Köln' },
  { name: 'Vorwerk',                url: 'https://karriere.vorwerk.de/stellenangebote/',                           ort: 'Wuppertal' },
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

// ── ATS API Fetchers ──────────────────────────────────────────────────────────

async function fetchGreenhouse(slug: string, firma: string, ort: string): Promise<CrawledJob[]> {
  const data = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {}, 10000)
  if (!data || data.includes('<!DOCTYPE')) return []
  try {
    const json = JSON.parse(data)
    return (json.jobs || [])
      .filter((j: any) => JOBTITEL_RE.test(j.title || ''))
      .map((j: any) => ({
        titel: j.title || '',
        unternehmen: firma,
        ort: j.location?.name || ort,
        plz: '',
        datum: '',
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
  if (!data || data.includes('<!DOCTYPE')) return []
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

// ── HTML Parsing Strategien ───────────────────────────────────────────────────

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
      titel: txt, unternehmen: firma, ort, plz: '', datum: '',
      url: href, quelle: `Direkt: ${firma}`, beschreibung: '', arbeitszeit: '',
      kategorie: classifyJob(txt),
    })
  }
  return jobs.slice(0, 8)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const runId = await startCrawlRun('firmenseiten')

  // Schritt 1: alle Career Pages parallel laden
  const htmlResults = await Promise.allSettled(
    FIRMEN.map(f => safeFetch(f.url, { headers: CRAWL_HEADERS }, 12000))
  )

  // Schritt 2: für Firmen mit bekanntem/erkanntem ATS → API; sonst HTML parsing
  const atsApiCalls: Promise<CrawledJob[]>[] = FIRMEN.map((f, i) => {
    // Hardcoded ATS slug hat Vorrang
    if (f.greenhouse) return fetchGreenhouse(f.greenhouse, f.name, f.ort)
    if (f.lever)      return fetchLever(f.lever, f.name, f.ort)

    // ATS aus HTML erkennen
    const r = htmlResults[i]
    if (r.status === 'fulfilled' && r.value) {
      const ats = detectATS(r.value)
      if (ats?.type === 'greenhouse') return fetchGreenhouse(ats.slug, f.name, f.ort)
      if (ats?.type === 'lever')      return fetchLever(ats.slug, f.name, f.ort)
    }
    return Promise.resolve([])
  })
  const atsResults = await Promise.allSettled(atsApiCalls)

  const allJobs: CrawledJob[] = []
  const log: { firma: string; count: number; strategy: string }[] = []

  for (let i = 0; i < FIRMEN.length; i++) {
    const firma = FIRMEN[i]
    const before = allJobs.length

    // ATS API hatte Ergebnisse → verwenden
    const atsR = atsResults[i]
    if (atsR.status === 'fulfilled' && atsR.value.length > 0) {
      allJobs.push(...atsR.value)
      log.push({ firma: firma.name, count: atsR.value.length, strategy: 'ats-api' })
      continue
    }

    // HTML Parsing
    const htmlR = htmlResults[i]
    if (htmlR.status === 'rejected' || !htmlR.value) {
      log.push({ firma: firma.name, count: 0, strategy: 'timeout' })
      continue
    }
    const html = htmlR.value

    // Strategie 1: JSON-LD
    const jsonLd = parseJsonLd(html, firma.name, firma.ort).filter(j => JOBTITEL_RE.test(j.titel))
    if (jsonLd.length) {
      allJobs.push(...jsonLd)
      log.push({ firma: firma.name, count: jsonLd.length, strategy: 'json-ld' })
      continue
    }
    // Strategie 2: __NEXT_DATA__
    const next = parseNextData(html, firma.name, firma.ort).filter(j => JOBTITEL_RE.test(j.titel))
    if (next.length) {
      allJobs.push(...next)
      log.push({ firma: firma.name, count: next.length, strategy: 'next-data' })
      continue
    }
    // Strategie 3: Link-Scan Fallback
    const links = parseLinkScan(html, firma.name, firma.ort, firma.url)
    allJobs.push(...links)
    log.push({ firma: firma.name, count: links.length, strategy: links.length ? 'link-scan' : 'none' })
  }

  // Deduplizieren
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
  try {
    inserted = await upsertJobs(deduped)
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, deduped.length, inserted, error ? 'error' : 'done', error)

  // Nur Firmen mit Fund im Log zurückgeben
  const hits = log.filter(l => l.count > 0)
  return res.status(200).json({
    ok: !error,
    source: 'firmenseiten',
    firms_checked: FIRMEN.length,
    firms_with_jobs: hits.length,
    hits,
    fetched: allJobs.length,
    deduped: deduped.length,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
