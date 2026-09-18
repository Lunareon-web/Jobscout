/**
 * Cron: Bundesagentur für Arbeit + KldB-Berufsgruppen
 * Läuft manuell oder täglich via Cron.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'

const BA_API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs'
const BA_KEY = 'jobboerse-jobsuche'
const STANDORT = 'Düsseldorf'
const UMKREIS = 60
const MAX_TAGE = 30

// Jobtitel — breite Abdeckung Design / Interior / Architektur / Management
const JOBTITEL = [
  // Design & Produkt
  'Designer', 'Produktdesigner', 'Brand Designer', 'Concept Designer',
  'Visual Merchandiser', 'Grafiker', 'UX Designer', 'Art Director',
  // Interior & Architektur
  'Innenarchitekt', 'Interior Designer', 'Raumplaner', 'Raumgestalter',
  'Architekt', 'Ausstellungsgestalter', 'Ladenbauer', 'Messebauer',
  // Management & Projekt
  'Projektmanager', 'Project Manager', 'Design Manager', 'Bauleiter',
  'Kreativdirektor', 'Creative Director', 'Marketingmanager',
  // Retail & Shop
  'Shop Konzept', 'Retail Designer', 'Store Designer', 'Schaufenstergestalter',
]

// KldB 2010 Berufsgruppen (5-stellig, nur erste 4 Stellen für BA-API)
// Quelle: https://statistik.arbeitsagentur.de/DE/Navigation/Grundlagen/Klassifikationen/Klassifikation-der-Berufe/KldB2010/KldB2010-Nav.html
const BERUFSGRUPPEN = [
  '3131',  // Innenarchitektur
  '3132',  // Architektur
  '3141',  // Produkt-/Industriedesign
  '3142',  // Grafik-/Kommunikationsdesign
  '3143',  // Mode-/Textildesign
  '2153',  // Werbung, Marketing, PR
]

const JOBTITEL_RE = /designer|innenarchitekt|interior|architekt|raumplan|raumgestalt|concept|brand|visual|merchandis|manager|projektleit|projektmanager|project\s*man|bauleiter|kreativ|director|ladenbauer|messebau|ausstellung|grafik|marketing|shopkonzept|retail\s*design|store\s*design|workplace/i

async function baFetch(url: string): Promise<any[]> {
  try {
    const r = await fetch(url, {
      headers: { 'X-API-Key': BA_KEY },
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) return []
    const data = await r.json()
    return data?.ergebnisliste || data?.stellenangebote || []
  } catch { return [] }
}

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
    ort: loc?.adresse?.ort || STANDORT,
    plz: loc?.adresse?.plz || '',
  }
}

function normalize(s: any, quelle: string): CrawledJob {
  // v6-Schema (ergebnisliste)
  if (s.stellenangebotsTitel || s.referenznummer) {
    const titel = s.stellenangebotsTitel || ''
    const { ort, plz } = firstLocation(s)
    const ref = s.referenznummer || ''
    return {
      titel,
      unternehmen: s.firma || '',
      ort,
      plz,
      datum: s.veroeffentlichungszeitraum?.von || s.datumErsteVeroeffentlichung || '',
      url: toJobDetailUrl(ref),
      quelle,
      beschreibung: s.hauptberuf || (Array.isArray(s.alleBerufe) ? s.alleBerufe.join(', ') : ''),
      arbeitszeit: s.arbeitszeitVollzeit === true ? 'Vollzeit' : s.arbeitszeitVollzeit === false ? 'Teilzeit' : '',
      kategorie: classifyJob(titel),
    }
  }
  const titel = s.titel || ''
  return {
    titel,
    unternehmen: s.arbeitgeber || '',
    ort: s.arbeitsort?.ort || STANDORT,
    plz: s.arbeitsort?.plz || '',
    datum: s.aktuelleVeroeffentlichungsdatum || s.eintrittsdatum || '',
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${s.hashId || s.refnr || ''}`,
    quelle,
    beschreibung: s.beruf || '',
    arbeitszeit: (s.arbeitszeitmodelle || []).join(', '),
    kategorie: classifyJob(titel),
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const runId = await startCrawlRun('ba')
  const raw: CrawledJob[] = []

  // ── 1. Titelsuche: alle Titel × 3 Seiten parallel (v6: Seiten ab 1) ──
  const titleUrls = JOBTITEL.flatMap(t =>
    [1, 2, 3].map(p =>
      `${BA_API}?was=${encodeURIComponent(t)}&wo=${encodeURIComponent(STANDORT)}&umkreis=${UMKREIS}&angebotsart=1&veroeffentlichtseit=${MAX_TAGE}&size=25&page=${p}`
    )
  )
  const titleResults = await Promise.allSettled(titleUrls.map(baFetch))
  titleResults.forEach(r => {
    if (r.status === 'fulfilled')
      r.value.forEach(s => raw.push(normalize(s, 'Bundesagentur für Arbeit')))
  })

  // ── 2. KldB-Berufsgruppen parallel ──────────────────────────────────
  const bgUrls = BERUFSGRUPPEN.map(g =>
    `${BA_API}?wo=${encodeURIComponent(STANDORT)}&umkreis=${UMKREIS}&berufsgruppe=${g}&angebotsart=1&veroeffentlichtseit=${MAX_TAGE}&size=50&page=1`
  )
  const bgResults = await Promise.allSettled(bgUrls.map(baFetch))
  bgResults.forEach(r => {
    if (r.status === 'fulfilled')
      r.value.forEach(s => raw.push(normalize(s, 'BA Berufsgruppen')))
  })

  // ── Relevanzfilter + Deduplizierung ─────────────────────────────────
  const seen = new Set<string>()
  const deduped = raw.filter(j => {
    if (!j.titel || j.titel.length < 2) return false
    if (!JOBTITEL_RE.test(j.titel)) return false
    const key = (j.url || `${j.titel}|${j.unternehmen}`).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let inserted = 0
  let error: string | undefined
  try {
    inserted = await upsertJobs(deduped)
    await deactivateOldJobs(30)
  } catch (e) {
    error = String(e)
  }

  if (runId) await finishCrawlRun(runId, deduped.length, inserted, error ? 'error' : 'done', error)

  return res.status(200).json({
    ok: !error,
    source: 'ba',
    fetched: raw.length,
    deduped: deduped.length,
    inserted,
    ts: new Date().toISOString(),
    ...(error ? { error } : {}),
  })
}
