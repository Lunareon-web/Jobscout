import type { VercelRequest, VercelResponse } from '@vercel/node'

const BA_API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs'
const BA_KEY = 'jobboerse-jobsuche'

const JOBTITEL_DEFAULT = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

// KldB Berufsgruppen für Design/Architektur/Management
const BERUFSGRUPPEN = [
  '7310', '7311', '7312', '7313', // Architektur & Innenarchitektur
  '7320', '7321', '7322', '7323', // Produkt-/Industrie-/Grafikdesign
  '7130', '7131', '7132',         // Unternehmensberatung & Management
  '7140', '7141',                 // Projektmanagement
]

function normalizeBA(s: any) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

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

  // Titelsuche — alle Titel, 2 Seiten, alle parallel
  const titleRequests = jobtitel.flatMap(titel =>
    [0, 1, 2].map(page => // 3 Seiten statt 2
      `${BA_API}?was=${encodeURIComponent(titel)}&wo=${encodeURIComponent(standort)}&umkreis=${umkreis}&angebotsart=1&size=25&page=${page}`
    )
  )

  const t0 = Date.now()
  try {
    const responses = await Promise.allSettled(
      titleRequests.map(url =>
        fetch(url, {
          headers: { 'X-API-Key': BA_KEY },
          signal: AbortSignal.timeout(8000),
        })
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      )
    )
    responses.forEach(r => {
      if (r.status === 'fulfilled' && r.value?.stellenangebote) {
        r.value.stellenangebote.forEach((s: any) => jobs.push(normalizeBA(s)))
      }
    })
    log.push({ quelle: 'BA Titelsuche', anzahl: jobs.length, ms: Date.now() - t0, ok: true })
  } catch (e) {
    log.push({ quelle: 'BA Titelsuche', anzahl: 0, ms: Date.now() - t0, ok: false, fehler: String(e) })
  }

  // Berufsgruppen-Suche parallel
  const t1 = Date.now()
  const bgCount0 = jobs.length
  try {
    const bgResponses = await Promise.all(
      BERUFSGRUPPEN.map(grp =>
        fetch(`${BA_API}?wo=${encodeURIComponent(standort)}&umkreis=${umkreis}&berufsgruppe=${grp}&angebotsart=1&size=25&page=0`,
          { headers: { 'X-API-Key': BA_KEY } })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )
    bgResponses.forEach(data => {
      if (!data?.stellenangebote) return
      data.stellenangebote.forEach((s: any) => jobs.push(normalizeBA(s)))
    })
    log.push({ quelle: 'BA Berufsgruppen (Design/Arch/Mgmt)', anzahl: jobs.length - bgCount0, ms: Date.now() - t1, ok: true })
  } catch (e) {
    log.push({ quelle: 'BA Berufsgruppen', anzahl: 0, ms: Date.now() - t1, ok: false, fehler: String(e) })
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

  return res.status(200).json({
    jobs: deduped.slice(0, 200),
    total: deduped.length,
    raw: jobs.length,
    log,
    ts: new Date().toISOString(),
  })
}
