/**
 * Cron: Firmenseiten direkt crawlen (JSON-LD, __NEXT_DATA__, Link-Scan)
 * Schedule: alle 4 Stunden
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { stripHtml, safeFetch } from '../_lib/helpers'

const JOBTITEL = [
  'Projektmanager', 'Project Manager', 'Design Manager', 'Designer',
  'Produktdesigner', 'Interior Designer', 'Innenarchitekt', 'Raumplaner',
  'Concept Designer', 'Brand Designer', 'Visual Merchandiser',
]

const FIRMEN: { name: string; url: string; ort: string }[] = [
  { name: 'HPP Architekten',      url: 'https://www.hpp.com/de/karriere/',                                         ort: 'Düsseldorf' },
  { name: 'RKW Architektur',      url: 'https://www.rkw-architektur.de/buero/karriere/',                           ort: 'Düsseldorf' },
  { name: 'Ingenhoven Architects',url: 'https://www.ingenhovenarchitects.com/studio/karriere/',                     ort: 'Düsseldorf' },
  { name: 'Dula-Werke',           url: 'https://www.dula.de/karriere/',                                            ort: 'Mönchengladbach' },
  { name: 'Syma-System',          url: 'https://www.syma.de/de/karriere/',                                         ort: 'Meerbusch' },
  { name: 'Kurz Design',          url: 'https://www.kurz-design.de/karriere/',                                     ort: 'Neuss' },
  { name: 'OPUS Marketing',       url: 'https://www.opus-marketing.de/karriere/',                                  ort: 'Düsseldorf' },
  { name: 'flora&faunavisions',   url: 'https://www.florafaunavisions.de/karriere/',                               ort: 'Düsseldorf' },
  { name: 'Eller + Eller',        url: 'https://www.eller-eller.de/karriere/',                                     ort: 'Düsseldorf' },
  { name: 'Pieron Shopkonzepte',  url: 'https://www.pieron.de/unternehmen/karriere/',                              ort: 'Neuss' },
  { name: 'Umdasch Shop Concept', url: 'https://www.umdasch-shop-concept.com/de/unternehmen/karriere/',            ort: 'Neuss' },
  { name: 'Blocher Partners',     url: 'https://www.blocherpartners.de/karriere/',                                 ort: 'Düsseldorf' },
  { name: 'CB.e Retail Solutions',url: 'https://www.cbe-retail.com/karriere/',                                     ort: 'Hilden' },
  { name: 'Materie',              url: 'https://www.materie.de/karriere/',                                         ort: 'Düsseldorf' },
  { name: 'Schweitzer Project',   url: 'https://www.schweitzer-project.com/karriere/',                             ort: 'Düsseldorf' },
  { name: 'Lindner Hotels',       url: 'https://karriere.lindner.de/',                                             ort: 'Düsseldorf' },
  { name: 'Douglas',              url: 'https://karriere.douglas.de/stellenangebote/',                             ort: 'Düsseldorf' },
  { name: 'Peek & Cloppenburg',   url: 'https://karriere.peek-cloppenburg.de/stellenangebote/',                    ort: 'Düsseldorf' },
  { name: 'METRO',                url: 'https://jobs.metro.com/de/de/search-results?m=20',                         ort: 'Düsseldorf' },
  { name: 'dart Architekten',     url: 'https://www.dart-architekten.de/buero/',                                   ort: 'Düsseldorf' },
]

const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121',
  'Accept-Language': 'de-DE,de;q=0.9',
}

// ── HTML-Parser-Strategien ────────────────────────────────────

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
          url: item.url || item.applyUrl || '',
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

function parseLinkScan(html: string, firma: string, ort: string, keyRe: RegExp): CrawledJob[] {
  const jobs: CrawledJob[] = []
  const baseM = firma.match(/^(https?:\/\/[^/]+)/)
  const aRe = /<a[^>]+href="([^"]{5,200})"[^>]*>([^<]{4,100})<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = aRe.exec(html)) !== null) {
    const txt = stripHtml(m[2])
    if (!keyRe.test(txt) || txt.length > 100) continue
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
  return jobs.slice(0, 10)
}

// ── Handler ───────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const keyRe = new RegExp(
    JOBTITEL.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'
  )
  const runId = await startCrawlRun('firmenseiten')

  // Alle Firmenseiten parallel laden
  const htmlResults = await Promise.allSettled(
    FIRMEN.map(f => safeFetch(f.url, { headers: CRAWL_HEADERS }, 12000))
  )

  const allJobs: CrawledJob[] = []
  const log: { firma: string; count: number; ok: boolean }[] = []

  for (let i = 0; i < FIRMEN.length; i++) {
    const firma = FIRMEN[i]
    const r = htmlResults[i]
    if (r.status === 'rejected' || !r.value) {
      log.push({ firma: firma.name, count: 0, ok: false })
      continue
    }
    const html = r.value
    const before = allJobs.length

    // Strategie 1: JSON-LD (bestes Signal)
    const jsonLd = parseJsonLd(html, firma.name, firma.ort).filter(j => keyRe.test(j.titel))
    if (jsonLd.length) {
      allJobs.push(...jsonLd)
    } else {
      // Strategie 2: __NEXT_DATA__
      const next = parseNextData(html, firma.name, firma.ort).filter(j => keyRe.test(j.titel))
      if (next.length) {
        allJobs.push(...next)
      } else {
        // Strategie 3: Link-Scan Fallback
        allJobs.push(...parseLinkScan(html, firma.name, firma.ort, keyRe))
      }
    }
    log.push({ firma: firma.name, count: allJobs.length - before, ok: true })
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

  return res.status(200).json({
    ok: !error,
    source: 'firmenseiten',
    log,
    fetched: allJobs.length,
    deduped: deduped.length,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
