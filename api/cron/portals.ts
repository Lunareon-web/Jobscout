/**
 * Cron: Jobportale — Edge Runtime (Cloudflare CDN-IPs, weniger IP-Blocking als AWS Lambda)
 * Quellen: Kimeta, Indeed, Karriere.de, Stellenanzeigen.de, Kalaydo, StepStone, Jobware
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { XMLParser } from 'fast-xml-parser'
import { startCrawlRun, finishCrawlRun, upsertJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { stripHtml, parsePubDate, slugify, safeFetch } from '../_lib/helpers'

const JOBTITEL = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser', 'Architekt',
  'Bauleiter', 'Kreativdirektor', 'Art Director',
]
const STANDORT = 'Düsseldorf'
const UMKREIS = 50
const MAX_TAGE = 30

// ── RSS Parser ────────────────────────────────────────────────────────────────

function parseRSS(xml: string, quelle: string): CrawledJob[] {
  if (!xml || xml.length < 50 || xml.trimStart().startsWith('<!DOCTYPE')) return []
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true })
  const jobs: CrawledJob[] = []
  try {
    const result = parser.parse(xml)
    const channel = result?.rss?.channel || result?.feed || result?.['rdf:RDF']
    if (!channel) return rssRegexFallback(xml, quelle)
    const items = [
      ...(Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : []),
      ...(Array.isArray(channel.entry) ? channel.entry : channel.entry ? [channel.entry] : []),
    ]
    items.forEach(item => {
      const titel = stripHtml(String(item.title || ''))
      if (!titel || titel.length < 3) return
      const url = String(item.link?.['#text'] || item.link || item.guid?.['#text'] || item.guid || '')
      const datum = parsePubDate(String(item.pubDate || item.published || item.updated || ''))
      const firma = stripHtml(String(item.author || item['dc:creator'] || item['job:company'] || ''))
      const ort = stripHtml(String(item['job:location'] || item.location || STANDORT))
      const desc = stripHtml(String(item.description || item.summary || '')).slice(0, 200)
      jobs.push({ titel, unternehmen: firma, ort, plz: '', datum, url, quelle, beschreibung: desc, arbeitszeit: '', kategorie: classifyJob(titel) })
    })
  } catch {
    return rssRegexFallback(xml, quelle)
  }
  return jobs
}

function rssRegexFallback(xml: string, quelle: string): CrawledJob[] {
  const jobs: CrawledJob[] = []
  if (!xml || xml.trimStart().startsWith('<!DOCTYPE')) return jobs
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/title>/i)
    const linkM  = block.match(/<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/link>/i)
    const dateM  = block.match(/<pubDate[^>]*>([^<]*)<\/pubDate>/i)
    const titel  = stripHtml(titleM ? (titleM[1] || titleM[2] || '') : '')
    if (!titel || titel.length < 3) continue
    jobs.push({
      titel, unternehmen: '', ort: STANDORT, plz: '',
      datum: parsePubDate(dateM?.[1] || ''),
      url: linkM ? (linkM[1] || linkM[2] || '') : '',
      quelle, beschreibung: '', arbeitszeit: '',
      kategorie: classifyJob(titel),
    })
  }
  return jobs
}

function parseJsonLd(html: string, quelle: string): CrawledJob[] {
  if (!html || html.trimStart().startsWith('<!DOCTYPE')) return []
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
          titel, unternehmen: item.hiringOrganization?.name || '',
          ort: item.jobLocation?.address?.addressLocality || STANDORT,
          plz: item.jobLocation?.address?.postalCode || '',
          datum: item.datePosted || '',
          url: item.url || item['@id'] || '',
          quelle, beschreibung: stripHtml(item.description || '').slice(0, 200),
          arbeitszeit: item.employmentType || '',
          kategorie: classifyJob(titel),
        })
      })
    } catch {}
  }
  return jobs
}

// ── Quellen ───────────────────────────────────────────────────────────────────

// Kimeta: oft geblockt, fallback auf JSON-LD wenn RSS leer
async function fetchKimeta(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 8).map(t => safeFetch(
      `https://www.kimeta.de/stellenangebote/?q=${encodeURIComponent(t)}&l=${encodeURIComponent(STANDORT)}&r=${UMKREIS}&output=rss`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher-Google/1.0)' } }
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseRSS(r.value, 'Kimeta RSS') : [])
  return { jobs, count: jobs.length }
}

// Indeed RSS — alternativer User-Agent
async function fetchIndeed(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 5).map(t => safeFetch(
      `https://de.indeed.com/rss?q=${encodeURIComponent(t)}&l=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}&fromage=${MAX_TAGE}&sort=date`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseRSS(r.value, 'Indeed') : [])
  return { jobs, count: jobs.length }
}

// Karriere.de RSS
async function fetchKarriere(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 8).map(t => safeFetch(
      `https://www.karriere.de/jobs/rss?what=${encodeURIComponent(t)}&where=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}`
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseRSS(r.value, 'Karriere.de') : [])
  return { jobs, count: jobs.length }
}

// Stellenanzeigen.de RSS
async function fetchStellenanzeigen(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 8).map(t => safeFetch(
      `https://www.stellenanzeigen.de/job-ticker/rss.xml?suchbegriff=${encodeURIComponent(t)}&arbeitsort=${encodeURIComponent(STANDORT)}&umkreis=${UMKREIS}`
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseRSS(r.value, 'Stellenanzeigen.de') : [])
  return { jobs, count: jobs.length }
}

// Kalaydo — regional NRW, JSON-LD
async function fetchKalaydo(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 6).map(t => safeFetch(
      `https://www.kalaydo.de/jobs/ergebnisse/?what=${encodeURIComponent(t)}&where=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE' } }
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseJsonLd(r.value, 'Kalaydo (Rheinland)') : [])
  return { jobs, count: jobs.length }
}

// StepStone — JSON-LD aus HTML
async function fetchStepStone(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 6).map(t => safeFetch(
      `https://www.stepstone.de/jobs/${slugify(t)}/in-${slugify(STANDORT)}/?radius=${UMKREIS}&sort=date&fromage=${MAX_TAGE}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE,de;q=0.9' } }
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseJsonLd(r.value, 'StepStone') : [])
  return { jobs, count: jobs.length }
}

// Jobware RSS
async function fetchJobware(): Promise<{ jobs: CrawledJob[]; count: number }> {
  const results = await Promise.allSettled(
    JOBTITEL.slice(0, 6).map(t => safeFetch(
      `https://www.jobware.de/suche/?q=${encodeURIComponent(t)}&l=${encodeURIComponent(STANDORT)}&r=${UMKREIS}&format=rss`
    ))
  )
  const jobs = results.flatMap(r => r.status === 'fulfilled' ? parseRSS(r.value, 'Jobware') : [])
  return { jobs, count: jobs.length }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const runId = await startCrawlRun('portals')

  const [kimeta, indeed, karriere, stellenanzeigen, kalaydo, stepstone, jobware] =
    await Promise.allSettled([
      fetchKimeta(), fetchIndeed(), fetchKarriere(),
      fetchStellenanzeigen(), fetchKalaydo(), fetchStepStone(), fetchJobware(),
    ])

  const sources = [
    { name: 'kimeta',          r: kimeta },
    { name: 'indeed',          r: indeed },
    { name: 'karriere',        r: karriere },
    { name: 'stellenanzeigen', r: stellenanzeigen },
    { name: 'kalaydo',         r: kalaydo },
    { name: 'stepstone',       r: stepstone },
    { name: 'jobware',         r: jobware },
  ]

  const allJobs: CrawledJob[] = []
  const bySource: Record<string, number> = {}

  for (const { name, r } of sources) {
    if (r.status === 'fulfilled') {
      allJobs.push(...r.value.jobs)
      bySource[name] = r.value.count
    } else {
      bySource[name] = -1
    }
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
    source: 'portals',
    by_source: bySource,
    fetched: allJobs.length,
    deduped: deduped.length,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
