import type { VercelRequest, VercelResponse } from '@vercel/node'
import { XMLParser } from 'fast-xml-parser'

const JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner',
]

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

function parsePubDate(s: string): string {
  if (!s) return ''
  try {
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
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

    const items: any[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item ? [channel.item] : []

    // Atom feeds
    const entries: any[] = Array.isArray(channel.entry)
      ? channel.entry
      : channel.entry ? [channel.entry] : []

    const allItems = [...items, ...entries]

    allItems.forEach(item => {
      const titel = stripHtml(String(item.title || ''))
      if (!titel || titel.length < 3) return
      const url = item.link?.['#text'] || item.link || item.guid?.['#text'] || item.guid || ''
      const datum = parsePubDate(String(item.pubDate || item.published || item.updated || ''))
      const firma = stripHtml(String(item.author || item['dc:creator'] || item.source?.['#text'] || ''))
      const desc = stripHtml(String(item.description || item.summary || item.content || '')).slice(0, 200)

      jobs.push({ titel, unternehmen: firma, ort: standort, plz: '', datum, url: String(url), quelle, beschreibung: desc, arbeitszeit: '' })
    })
  } catch (e) {
    // Regex fallback
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
    let im: RegExpExecArray | null
    while ((im = itemRe.exec(xml)) !== null) {
      const block = im[1]
      const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/title>/i)
      const linkM = block.match(/<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/link>/i)
      const dateM = block.match(/<pubDate[^>]*>([^<]*)<\/pubDate>/i)
      const titel = stripHtml(titleM ? (titleM[1] || titleM[2] || '') : '')
      if (!titel || titel.length < 3) continue
      const url = linkM ? (linkM[1] || linkM[2] || '') : ''
      jobs.push({ titel, unternehmen: '', ort: standort, plz: '', datum: parsePubDate(dateM?.[1] || ''), url, quelle, beschreibung: '', arbeitszeit: '' })
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
      const raw = m[1].trim()
      if (!raw) continue
      const obj = JSON.parse(raw)
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
    } catch { /* skip malformed */ }
  }
  return jobs
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const standort = (req.query.standort as string) || 'Düsseldorf'
  const maxTage = parseInt((req.query.max_tage as string) || '15')
  const jobtitelParam = req.query.jobtitel as string
  const jobtitel = jobtitelParam
    ? jobtitelParam.split(',').map(t => t.trim()).filter(Boolean)
    : JOBTITEL_DEFAULT

  const cutoff = new Date(Date.now() - maxTage * 86_400_000)
  const allJobs: any[] = []
  const log: any[] = []

  async function run(label: string, fn: () => Promise<any[]>) {
    const t0 = Date.now()
    try {
      const jobs = await fn()
      allJobs.push(...jobs)
      log.push({ quelle: label, anzahl: jobs.length, ms: Date.now() - t0, ok: true })
    } catch (e) {
      log.push({ quelle: label, anzahl: 0, ms: Date.now() - t0, ok: false, fehler: String(e) })
    }
  }

  // --- Kimeta RSS (208KB bestätigt) ---
  await run('Kimeta RSS', async () => {
    const jobs: any[] = []
    const responses = await Promise.allSettled(
      jobtitel.slice(0, 6).map(t =>
        fetch(`https://www.kimeta.de/stellenangebote/?q=${encodeURIComponent(t)}&l=${encodeURIComponent(standort)}&r=50&output=rss`,
          { headers: { 'Accept': 'application/rss+xml, application/xml, */*' } })
          .then(r => r.ok ? r.text() : '')
          .catch(() => '')
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        jobs.push(...parseRSS(r.value, 'Kimeta', standort))
      }
    })
    return jobs
  })

  // --- StepStone JSON-LD ---
  await run('StepStone', async () => {
    const jobs: any[] = []
    const responses = await Promise.allSettled(
      jobtitel.slice(0, 4).map(titel => {
        const slug = titel.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        return fetch(
          `https://www.stepstone.de/jobs/${slug}/in-duesseldorf/?radius=50&sort=date&fromage=${maxTage}`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Accept-Language': 'de-DE' } }
        ).then(r => r.ok ? r.text() : '').catch(() => '')
      })
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        jobs.push(...parseJsonLd(r.value, 'StepStone', standort))
      }
    })
    return jobs
  })

  // --- Karriere.de RSS ---
  await run('Karriere.de', async () => {
    const jobs: any[] = []
    const responses = await Promise.allSettled(
      jobtitel.slice(0, 5).map(t =>
        fetch(`https://www.karriere.de/jobs/rss?what=${encodeURIComponent(t)}&where=${encodeURIComponent(standort)}&radius=50`)
          .then(r => r.ok ? r.text() : '').catch(() => '')
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        jobs.push(...parseRSS(r.value, 'Karriere.de', standort))
      }
    })
    return jobs
  })

  // --- Stellenanzeigen.de RSS ---
  await run('Stellenanzeigen.de', async () => {
    const jobs: any[] = []
    const responses = await Promise.allSettled(
      jobtitel.slice(0, 4).map(t =>
        fetch(`https://www.stellenanzeigen.de/job-ticker/rss.xml?suchbegriff=${encodeURIComponent(t)}&arbeitsort=${encodeURIComponent(standort)}&umkreis=50`)
          .then(r => r.ok ? r.text() : '').catch(() => '')
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        jobs.push(...parseRSS(r.value, 'Stellenanzeigen.de', standort))
      }
    })
    return jobs
  })

  // --- Kalaydo JSON-LD ---
  await run('Kalaydo (Rheinland)', async () => {
    const jobs: any[] = []
    const responses = await Promise.allSettled(
      jobtitel.slice(0, 3).map(t =>
        fetch(`https://www.kalaydo.de/jobs/ergebnisse/?what=${encodeURIComponent(t)}&where=${encodeURIComponent(standort)}&radius=50`,
          { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE' } })
          .then(r => r.ok ? r.text() : '').catch(() => '')
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        jobs.push(...parseJsonLd(r.value, 'Kalaydo', standort))
      }
    })
    return jobs
  })

  // Deduplizieren + Filtern
  const seen = new Set<string>()
  const deduped = allJobs.filter(j => {
    if (!j.titel || j.titel.length < 3) return false
    const key = `${j.titel}|${j.unternehmen}|${j.url}`.toLowerCase().replace(/\s/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    if (j.datum) {
      const d = new Date(j.datum)
      if (!isNaN(d.getTime()) && d < cutoff) return false
    }
    return true
  }).sort((a, b) => new Date(b.datum || 0).getTime() - new Date(a.datum || 0).getTime())

  return res.status(200).json({ jobs: deduped.slice(0, 200), total: deduped.length, raw: allJobs.length, log, ts: new Date().toISOString() })
}
