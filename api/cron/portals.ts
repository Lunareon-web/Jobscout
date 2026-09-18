/**
 * Cron: Jobportale via Jina + Gemini
 * RSS von Vercel AWS-IPs wird von allen deutschen Portalen geblockt.
 * Lösung: Jina Reader (andere IPs) + Gemini zur Job-Extraktion.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { slugify } from '../_lib/helpers'

const STANDORT = 'Düsseldorf'
const UMKREIS = 50

const PORTAL_RELEVANZ = /designer|innenarchitekt|interior|architekt|projektmanager|project.man|brand|visual|merchandis|kreativ|director|retail|marketing|bauleiter|raumplan/i

// Eine breite Suche pro Portal — Jina umgeht IP-Blocking von Vercel
const PORTAL_URLS: Record<string, string> = {
  karriere:        `https://www.karriere.de/jobs?what=Designer+Innenarchitekt+Architekt&where=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}`,
  stepstone:       `https://www.stepstone.de/jobs/designer/in-${slugify(STANDORT)}/?radius=${UMKREIS}&sort=date`,
  kimeta:          `https://www.kimeta.de/stellenangebote/?q=Designer+Architekt+Projektmanager&l=${encodeURIComponent(STANDORT)}&r=${UMKREIS}`,
  indeed:          `https://de.indeed.com/jobs?q=Designer+Innenarchitekt&l=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}&sort=date`,
  stellenanzeigen: `https://www.stellenanzeigen.de/stellenangebote/${encodeURIComponent(STANDORT)}/designer/`,
  jobware:         `https://www.jobware.de/suche/?q=Designer+Architekt&l=${encodeURIComponent(STANDORT)}&r=${UMKREIS}`,
  kalaydo:         `https://www.kalaydo.de/jobs/ergebnisse/?what=Designer&where=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}`,
}

async function jinaFetch(url: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown', 'X-Timeout': '18' },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    return r.ok ? r.text() : ''
  } catch { clearTimeout(t); return '' }
}

async function geminiExtract(markdown: string, portalName: string, apiKey: string): Promise<CrawledJob[]> {
  if (!markdown || !apiKey) return []
  const prompt = `Job-Portal: ${portalName}. Extrahiere alle Stellenangebote für Design, Interior, Architektur, Retail, Marketing, Projektmanagement aus der Seite.
Antworte NUR mit JSON-Array, kein Text:
[{"titel":"...","unternehmen":"...","ort":"...","url":"https://..."}]
Leeres Array [] wenn keine passenden Stellen gefunden.
Seite:\n${markdown.slice(0, 4000)}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25000)
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        }),
        signal: ctrl.signal,
      }
    )
    clearTimeout(t)
    if (!r.ok) return []
    const data = await r.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr)
      ? arr.filter((j: any) => j.titel && PORTAL_RELEVANZ.test(j.titel)).map((j: any) => ({
          titel: j.titel, unternehmen: j.unternehmen || '', ort: j.ort || STANDORT,
          plz: '', datum: new Date().toISOString().slice(0, 10), url: j.url || '', quelle: portalName,
          beschreibung: '', arbeitszeit: '', kategorie: classifyJob(j.titel),
        }))
      : []
  } catch { clearTimeout(t); return [] }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const geminiKey: string =
    (typeof req.body === 'object' ? req.body?.gemini_key : '') ||
    process.env.GEMINI_API_KEY || ''

  if (!geminiKey) {
    return res.status(200).json({
      ok: false, source: 'portals', fetched: 0, deduped: 0, inserted: 0,
      error: 'Kein Gemini API Key — alle Portale brauchen Jina+Gemini (RSS von Vercel-IPs geblockt)',
      by_source: {},
    })
  }

  const runId = await startCrawlRun('portals')

  // Alle Portale parallel via Jina + Gemini
  const results = await Promise.allSettled(
    Object.entries(PORTAL_URLS).map(async ([name, url]) => {
      const md = await jinaFetch(url)
      const jobs = await geminiExtract(md, name, geminiKey)
      return { name, jobs, mdLen: md.length, mdSnippet: md.slice(0, 120) }
    })
  )

  const allJobs: CrawledJob[] = []
  const bySource: Record<string, number> = {}
  const debug: Record<string, { chars: number; snippet: string }> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allJobs.push(...r.value.jobs)
      bySource[r.value.name] = r.value.jobs.length
      debug[r.value.name] = { chars: r.value.mdLen, snippet: r.value.mdSnippet }
    }
  }

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
    await deactivateOldJobs(30)
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
    debug,
    ...(error ? { error } : {}),
  })
}
