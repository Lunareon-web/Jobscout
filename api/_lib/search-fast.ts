import type { VercelRequest, VercelResponse } from '@vercel/node'

const BA_API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs'
const BA_KEY = 'jobboerse-jobsuche'

const JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

const BERUFSGRUPPEN = [
  '3131', // Innenarchitektur
  '3132', // Architektur
  '3141', // Produkt-/Industriedesign
  '3142', // Grafik-/Kommunikationsdesign
  '3143', // Mode-/Textildesign
  '2153', // Werbung, Marketing, PR
]

function toJobDetailUrl(referenznummer: string): string {
  if (!referenznummer) return ''
  const b64 = Buffer.from(referenznummer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${b64}`
}

function firstLocation(s: any): { ort: string; plz: string } {
  const loc = Array.isArray(s.stellenlokationen)
    ? s.stellenlokationen[0]
    : s.stellenlokationen
  return {
    ort: loc?.adresse?.ort || '',
    plz: loc?.adresse?.plz || '',
  }
}

function normalizeBA(s: any) {
  if (s.stellenangebotsTitel || s.referenznummer) {
    const { ort, plz } = firstLocation(s)
    const ref = s.referenznummer || ''
    return {
      id: ref || Math.random().toString(36).slice(2),
      titel: s.stellenangebotsTitel || '',
      unternehmen: s.firma || '',
      ort,
      plz,
      datum: s.veroeffentlichungszeitraum?.von || s.datumErsteVeroeffentlichung || '',
      url: toJobDetailUrl(ref),
      quelle: 'Bundesagentur für Arbeit',
      beschreibung: s.hauptberuf || (Array.isArray(s.alleBerufe) ? s.alleBerufe.join(', ') : ''),
      arbeitszeit: s.arbeitszeitVollzeit === true ? 'Vollzeit' : s.arbeitszeitVollzeit === false ? 'Teilzeit' : '',
    }
  }
  return {
    id: s.hashId || s.refnr || Math.random().toString(36).slice(2),
    titel: s.titel || '',
    unternehmen: s.arbeitgeber || '',
    ort: s.arbeitsort?.ort || '',
    plz: s.arbeitsort?.plz || '',
    datum: s.aktuelleVeroeffentlichungsdatum || s.eintrittsdatum || '',
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${s.hashId || s.refnr || ''}`,
    quelle: 'Bundesagentur für Arbeit',
    beschreibung: s.beruf || '',
    arbeitszeit: (s.arbeitszeitmodelle || []).join(', '),
  }
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
  const jobs: any[] = []
  const log: any[] = []

  try {
    // Titelsuche — alle Titel, 3 Seiten (v6: Seiten beginnen bei 1)
    const titleRequests = jobtitel.flatMap(titel =>
      [1, 2, 3].map(page =>
        `${BA_API}?was=${encodeURIComponent(titel)}&wo=${encodeURIComponent(standort)}&umkreis=${umkreis}&angebotsart=1&veroeffentlichtseit=${maxTage}&size=25&page=${page}`
      )
    )

    const t0 = Date.now()
    const responses = await Promise.allSettled(
      titleRequests.map(url =>
        fetch(url, {
          headers: { 'X-API-Key': BA_KEY },
          signal: AbortSignal.timeout(8000),
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const list = r.value.ergebnisliste || r.value.stellenangebote || []
        list.forEach((s: any) => jobs.push(normalizeBA(s)))
      }
    })
    log.push({ quelle: 'BA Titelsuche', anzahl: jobs.length, ms: Date.now() - t0, ok: true })

    // Berufsgruppen-Suche parallel
    const t1 = Date.now()
    const bgCount0 = jobs.length
    const bgResponses = await Promise.all(
      BERUFSGRUPPEN.map(grp =>
        fetch(`${BA_API}?wo=${encodeURIComponent(standort)}&umkreis=${umkreis}&berufsgruppe=${grp}&angebotsart=1&veroeffentlichtseit=${maxTage}&size=25&page=1`,
          { headers: { 'X-API-Key': BA_KEY }, signal: AbortSignal.timeout(8000) })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )
    bgResponses.forEach(data => {
      const list = data?.ergebnisliste || data?.stellenangebote
      if (!list) return
      list.forEach((s: any) => jobs.push(normalizeBA(s)))
    })
    log.push({ quelle: 'BA Berufsgruppen (Design/Arch/Mgmt)', anzahl: jobs.length - bgCount0, ms: Date.now() - t1, ok: true })
  } catch (e) {
    log.push({ quelle: 'BA-API', anzahl: 0, ms: 0, ok: false, fehler: String(e) })
  }

  // Deduplizieren + Filtern
  const seen = new Set<string>()
  const deduped = jobs.filter(j => {
    if (!j.titel || j.titel.length < 2) return false
    const key = `${j.titel}|${j.unternehmen}|${j.url}`.toLowerCase().replace(/\s/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    if (j.datum) {
      const d = new Date(j.datum)
      if (!isNaN(d.getTime()) && d < cutoff) return false
    }
    return true
  }).sort((a, b) => new Date(b.datum || 0).getTime() - new Date(a.datum || 0).getTime())

  // IMMER 200 zurückgeben – auch bei Teilausfällen
  return res.status(200).json({
    jobs: deduped.slice(0, 200),
    total: deduped.length,
    raw: jobs.length,
    log,
    ts: new Date().toISOString(),
  })
}
