import type { VercelRequest, VercelResponse } from '@vercel/node'
import { XMLParser } from 'fast-xml-parser'

const JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

function parsePubDate(s: string): string {
  if (!s) return ''
  try { const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) }
  catch { return '' }
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
}

async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(timer)
    return res.ok ? await res.text() : ''
  } catch { return '' }
}

function parseRSS(xml: string, quelle: string, standort: string): any[] {
  const jobs: any[] = []
  if (!xml || xml.length < 100) return jobs
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true })
  try {
    const result = parser.parse(xml)
    const channel = result?.rss?.channel || result?.feed || result?.['rdf:RDF']
    if (!channel) return jobs
    const items = [
      ...(Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : []),
      ...(Array.isArray(channel.entry) ? channel.entry : channel.entry ? [channel.entry] : []),
    ]
    items.forEach(item => {
      const titel = stripHtml(String(item.title || ''))
      if (!titel || titel.length < 3) return
      const url = item.link?.['#text'] || item.link || item.guid?.['#text'] || item.guid || ''
      const datum = parsePubDate(String(item.pubDate || item.published || item.updated || ''))
      const firma = stripHtml(String(item.author || item['dc:creator'] || item['job:company'] || ''))
      const desc = stripHtml(String(item.description || item.summary || item.content || '')).slice(0, 200)
      const ort = stripHtml(String(item['job:location'] || item['location'] || standort))
      jobs.push({ titel, unternehmen: firma, ort, plz: '', datum, url: String(url), quelle, beschreibung: desc, arbeitszeit: '' })
    })
  } catch {
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
    let im: RegExpExecArray | null
    while ((im = itemRe.exec(xml)) !== null) {
      const block = im[1]
      const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/title>/i)
      const linkM = block.match(/<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/link>/i)
      const dateM = block.match(/<pubDate[^>]*>([^<]*)<\/pubDate>/i)
      const titel = stripHtml(titleM ? (titleM[1] || titleM[2] || '') : '')
      if (!titel || titel.length < 3) continue
      jobs.push({ titel, unternehmen: '', ort: standort, plz: '', datum: parsePubDate(dateM?.[1] || ''), url: linkM ? (linkM[1] || linkM[2] || '') : '', quelle, beschreibung: '', arbeitszeit: '' })
    }
  }
  return jobs
}

function parseJsonLd(html: string, quelle: string, standort: string): any[] {
  const jobs: any[] = []
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      const items: any[] = Array.isArray(obj) ? obj : (obj['@graph'] || [obj])
      items.forEach(item => {
        if (!item || item['@type'] !== 'JobPosting') return
        jobs.push({
          titel: item.title || '',
          unternehmen: item.hiringOrganization?.name || quelle,
          ort: item.jobLocation?.address?.addressLocality || standort,
          plz: item.jobLocation?.address?.postalCode || '',
          datum: item.datePosted || '',
          url: item.url || item['@id'] || '',
          quelle,
          beschreibung: stripHtml(item.description || '').slice(0, 200),
          arbeitszeit: item.employmentType || '',
        })
      })
    } catch { /* skip */ }
  }
  return jobs
}

async function fetchKimeta(jobtitel: string[], standort: string): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.map(t =>
      safeFetch(`https://www.kimeta.de/stellenangebote/?q=${encodeURIComponent(t)}&l=${encodeURIComponent(standort)}&r=50&output=rss`)
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseRSS(r.value, 'Kimeta', standort)) })
  return jobs
}

async function fetchStepStone(jobtitel: string[], standort: string, maxTage: number): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.map(titel => {
      const slug = slugify(titel)
      const url = `https://www.stepstone.de/jobs/${slug}/in-${slugify(standort)}/?radius=50&sort=date&fromage=${maxTage}`
      return safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE,de;q=0.9' } })
    })
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseJsonLd(r.value, 'StepStone', standort)) })
  return jobs
}

async function fetchKarriereDe(jobtitel: string[], standort: string): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.map(t =>
      safeFetch(`https://www.karriere.de/jobs/rss?what=${encodeURIComponent(t)}&where=${encodeURIComponent(standort)}&radius=50`)
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseRSS(r.value, 'Karriere.de', standort)) })
  return jobs
}

async function fetchStellenanzeigen(jobtitel: string[], standort: string): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.map(t =>
      safeFetch(`https://www.stellenanzeigen.de/job-ticker/rss.xml?suchbegriff=${encodeURIComponent(t)}&arbeitsort=${encodeURIComponent(standort)}&umkreis=50`)
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseRSS(r.value, 'Stellenanzeigen.de', standort)) })
  return jobs
}

async function fetchKalaydo(jobtitel: string[], standort: string): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.map(t =>
      safeFetch(`https://www.kalaydo.de/jobs/ergebnisse/?what=${encodeURIComponent(t)}&where=${encodeURIComponent(standort)}&radius=50`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE' } })
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseJsonLd(r.value, 'Kalaydo (Rheinland)', standort)) })
  return jobs
}

async function fetchJobware(jobtitel: string[], standort: string): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.slice(0, 6).map(t =>
      safeFetch(`https://www.jobware.de/suche/?q=${encodeURIComponent(t)}&l=${encodeURIComponent(standort)}&r=50&format=rss`)
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseRSS(r.value, 'Jobware', standort)) })
  return jobs
}

async function fetchIndeed(jobtitel: string[], standort: string, maxTage: number): Promise<any[]> {
  const jobs: any[] = []
  const results = await Promise.allSettled(
    jobtitel.slice(0, 5).map(t =>
      safeFetch(`https://de.indeed.com/rss?q=${encodeURIComponent(t)}&l=${encodeURIComponent(standort)}&radius=50&fromage=${maxTage}&sort=date`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } })
    )
  )
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) jobs.push(...parseRSS(r.value, 'Indeed', standort)) })
  return jobs
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const standort = (req.query.standort as string) || 'Düsseldorf'
  const umkreis = parseInt((req.query.umkreis as string) || '50')
  const maxTage = parseInt((req.query.max_tage as string) || '15')
  const jobtitelParam = req.query.jobtitel as string
  const jobtitel = jobtitelParam
    ? jobtitelParam.split(',').map(t => t.trim()).filter(Boolean)
    : JOBTITEL_DEFAULT

  const cutoff = new Date(Date.now() - maxTage * 86_400_000)
  const t0 = Date.now()

  try {
    const [kimeta, stepstone, karriere, stellenanzeigen, kalaydo, jobware, indeed] = await Promise.allSettled([
      fetchKimeta(jobtitel, standort),
      fetchStepStone(jobtitel, standort, maxTage),
      fetchKarriereDe(jobtitel, standort),
      fetchStellenanzeigen(jobtitel, standort),
      fetchKalaydo(jobtitel, standort),
      fetchJobware(jobtitel, standort),
      fetchIndeed(jobtitel, standort, maxTage),
    ])

    const sources = [
      { name: 'Kimeta RSS', result: kimeta },
      { name: 'StepStone', result: stepstone },
      { name: 'Karriere.de', result: karriere },
      { name: 'Stellenanzeigen.de', result: stellenanzeigen },
      { name: 'Kalaydo (Rheinland)', result: kalaydo },
      { name: 'Jobware', result: jobware },
      { name: 'Indeed', result: indeed },
    ]

    const allJobs: any[] = []
    const log: any[] = []

    sources.forEach(({ name, result }) => {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value)
        log.push({ quelle: name, anzahl: result.value.length, ms: Date.now() - t0, ok: true })
      } else {
        log.push({ quelle: name, anzahl: 0, ms: Date.now() - t0, ok: false, fehler: String(result.reason) })
      }
    })

    const seen = new Set<string>()
    const deduped = allJobs.filter(j => {
      if (!j.titel || j.titel.length < 3) return false
      const key = `${j.titel}|${j.unternehmen}`.toLowerCase().replace(/\s/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      if (j.datum) {
        const d = new Date(j.datum)
        if (!isNaN(d.getTime()) && d < cutoff) return false
      }
      return true
    }).sort((a, b) => new Date(b.datum || 0).getTime() - new Date(a.datum || 0).getTime())

    return res.status(200).json({
      jobs: deduped.slice(0, 300),
      total: deduped.length,
      raw: allJobs.length,
      log,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return res.status(200).json({
      jobs: [],
      total: 0,
      raw: 0,
      log: [{ quelle: 'Portale', anzahl: 0, ms: Date.now() - t0, ok: false, fehler: String(e) }],
      ts: new Date().toISOString(),
    })
  }
}
