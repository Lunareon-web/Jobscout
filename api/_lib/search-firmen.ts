import type { VercelRequest, VercelResponse } from '@vercel/node'

const FIRMEN = [
  { name: 'HPP Architekten', url: 'https://www.hpp.com/de/karriere/', ort: 'Düsseldorf' },
  { name: 'RKW Architektur', url: 'https://www.rkw-architektur.de/buero/karriere/', ort: 'Düsseldorf' },
  { name: 'Ingenhoven Architects', url: 'https://www.ingenhovenarchitects.com/studio/karriere/', ort: 'Düsseldorf' },
  { name: 'Dula-Werke', url: 'https://www.dula.de/karriere/', ort: 'Mönchengladbach' },
  { name: 'Syma-System', url: 'https://www.syma.de/de/karriere/', ort: 'Meerbusch' },
  { name: 'Kurz Design', url: 'https://www.kurz-design.de/karriere/', ort: 'Neuss' },
  { name: 'OPUS Marketing', url: 'https://www.opus-marketing.de/karriere/', ort: 'Düsseldorf' },
  { name: 'flora&faunavisions', url: 'https://www.florafaunavisions.de/karriere/', ort: 'Düsseldorf' },
  { name: 'Eller + Eller', url: 'https://www.eller-eller.de/karriere/', ort: 'Düsseldorf' },
  { name: 'Pieron Shopkonzepte', url: 'https://www.pieron.de/unternehmen/karriere/', ort: 'Neuss' },
  { name: 'Umdasch Shop Concept', url: 'https://www.umdasch-shop-concept.com/de/unternehmen/karriere/', ort: 'Neuss' },
  { name: 'Blocher Partners', url: 'https://www.blocherpartners.de/karriere/', ort: 'Düsseldorf' },
  { name: 'CB.e Retail Solutions', url: 'https://www.cbe-retail.com/karriere/', ort: 'Hilden' },
  { name: 'Materie', url: 'https://www.materie.de/karriere/', ort: 'Düsseldorf' },
  { name: 'Schweitzer Project', url: 'https://www.schweitzer-project.com/karriere/', ort: 'Düsseldorf' },
  { name: 'Lindner Hotels', url: 'https://karriere.lindner.de/', ort: 'Düsseldorf' },
  { name: 'Douglas Karriere', url: 'https://karriere.douglas.de/stellenangebote/', ort: 'Düsseldorf' },
  { name: 'Peek & Cloppenburg', url: 'https://karriere.peek-cloppenburg.de/stellenangebote/', ort: 'Düsseldorf' },
  { name: 'METRO Jobs', url: 'https://jobs.metro.com/de/de/search-results?m=20', ort: 'Düsseldorf' },
  { name: 'dart Architekten', url: 'https://www.dart-architekten.de/buero/', ort: 'Düsseldorf' },
]

const JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager', 'Designer',
  'Produktdesigner', 'Interior Designer', 'Innenarchitekt', 'Raumplaner',
  'Concept Designer', 'Brand Designer', 'Visual Merchandiser',
]

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseJsonLd(html: string, firma: string, ort: string): any[] {
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
          unternehmen: item.hiringOrganization?.name || firma,
          ort: item.jobLocation?.address?.addressLocality || ort,
          plz: item.jobLocation?.address?.postalCode || '',
          datum: item.datePosted || '',
          url: item.url || item['@id'] || '',
          quelle: `Direkt: ${firma}`,
          beschreibung: stripHtml(item.description || '').slice(0, 200),
          arbeitszeit: item.employmentType || '',
        })
      })
    } catch { /* skip */ }
  }
  return jobs
}

function parseNextData(html: string, firma: string, ort: string): any[] {
  const jobs: any[] = []
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
      if (Array.isArray(val) && val.length) {
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
            beschreibung: item.teaser || item.description || '',
            arbeitszeit: item.employmentType || '',
          })
        })
        break
      }
    }
  } catch { /* skip */ }
  return jobs
}

function parseLinkScan(html: string, firma: string, ort: string, keyRe: RegExp): any[] {
  const jobs: any[] = []
  const aRe = /<a[^>]+href="([^"]{5,200})"[^>]*>([^<]{4,100})<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = aRe.exec(html)) !== null) {
    const txt = stripHtml(m[2])
    if (!keyRe.test(txt) || txt.length > 100) continue
    let href = m[1]
    if (!href.startsWith('http')) {
      const base = firma.match(/^(https?:\/\/[^/]+)/)
      if (base) href = base[1] + (href.startsWith('/') ? href : '/' + href)
    }
    if (!href.startsWith('http')) continue
    jobs.push({ titel: txt, unternehmen: firma, ort, plz: '', datum: new Date().toISOString().slice(0, 10), url: href, quelle: `Direkt: ${firma}`, beschreibung: '', arbeitszeit: '' })
  }
  return jobs
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const jobtitelParam = req.query.jobtitel as string
  const jobtitel = jobtitelParam
    ? jobtitelParam.split(',').map(t => t.trim()).filter(Boolean)
    : JOBTITEL_DEFAULT

  const keyRe = new RegExp(
    jobtitel.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'
  )

  const t0 = Date.now()
  const allJobs: any[] = []
  const firmenLog: any[] = []

  try {
    const responses = await Promise.allSettled(
      FIRMEN.map(f =>
        fetch(f.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121',
            'Accept-Language': 'de-DE,de;q=0.9',
          },
          signal: AbortSignal.timeout(10_000),
        })
          .then(r => ({ ok: r.ok, html: r.ok ? r.text() : Promise.resolve('') }))
          .catch(() => ({ ok: false, html: Promise.resolve('') }))
      )
    )

    for (let i = 0; i < FIRMEN.length; i++) {
      const firma = FIRMEN[i]
      const result = responses[i]
      if (result.status === 'rejected') {
        firmenLog.push({ quelle: firma.name, anzahl: 0, ok: false, fehler: 'Timeout' })
        continue
      }
      const html = await result.value.html
      const pre = allJobs.length

      allJobs.push(...parseJsonLd(html, firma.name, firma.ort).filter(j => keyRe.test(j.titel)))
      if (allJobs.length === pre) {
        allJobs.push(...parseNextData(html, firma.name, firma.ort).filter(j => keyRe.test(j.titel)))
      }
      if (allJobs.length === pre) {
        allJobs.push(...parseLinkScan(html, firma.name, firma.ort, keyRe).slice(0, 10))
      }

      const found = allJobs.length - pre
      firmenLog.push({ quelle: firma.name, anzahl: found, ok: true })
    }
  } catch (e) {
    firmenLog.push({ quelle: 'Firmen-Suche', anzahl: 0, ok: false, fehler: String(e) })
  }

  const seen = new Set<string>()
  const deduped = allJobs.filter(j => {
    if (!j.titel || j.titel.length < 3) return false
    const key = `${j.titel}|${j.unternehmen}`.toLowerCase().replace(/\s/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return res.status(200).json({
    jobs: deduped,
    total: deduped.length,
    raw: allJobs.length,
    log: [{ quelle: 'Firmen-Direktsuche (20 Seiten)', anzahl: deduped.length, ms: Date.now() - t0, ok: true }, ...firmenLog],
    ts: new Date().toISOString(),
  })
}
