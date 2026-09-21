/**
 * Cron: Jobportale via Jina + Gemini
 * RSS von Vercel AWS-IPs wird von allen deutschen Portalen geblockt.
 * Lösung: Jina Reader (andere IPs) + Gemini zur Job-Extraktion.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { startCrawlRun, finishCrawlRun, upsertJobs, deactivateOldJobs, type CrawledJob } from '../_lib/upsert'
import { classifyJob } from '../_lib/classify'
import { slugify } from '../_lib/helpers'
import { geminiUrl } from '../_lib/gemini'

const STANDORT = 'Düsseldorf'
const UMKREIS = 50

const PORTAL_RELEVANZ = /designer|innenarchitekt|interior|architekt|projektmanager|project.man|brand|visual|merchandis|kreativ|director|retail|marketing|bauleiter|raumplan/i

// Eine breite Suche pro Portal — Jina umgeht IP-Blocking von Vercel.
// Hinweis: Indeed (Cloudflare-Challenge) und Jobware (kein Geo-Filter) liefern
// via Jina nichts Brauchbares und sind raus; Stellenanzeigen/Kalaydo mit
// verifizierten URL-Patterns (Sep 2026 via Jina gegengeprüft).
const PORTAL_URLS: Record<string, string> = {
  karriere:        `https://www.karriere.de/jobs?what=Designer+Innenarchitekt+Architekt&where=${encodeURIComponent(STANDORT)}&radius=${UMKREIS}`,
  stepstone:       `https://www.stepstone.de/jobs/designer/in-${slugify(STANDORT)}/?radius=${UMKREIS}&sort=date`,
  kimeta:          `https://www.kimeta.de/stellenangebote/?q=Designer+Architekt+Projektmanager&l=${encodeURIComponent(STANDORT)}&r=${UMKREIS}`,
  stellenanzeigen: `https://www.stellenanzeigen.de/jobs/duesseldorf`,
  kalaydo:         `https://www.kalaydo.de/stellenangebote/`,
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

async function geminiExtract(
  markdown: string,
  portalName: string,
  apiKey: string,
): Promise<{ jobs: CrawledJob[]; error?: string; note?: string }> {
  if (!markdown || !apiKey) return { jobs: [] }
  // Zwei Fenster: Stellenlisten stehen selten in den ersten 4000 Zeichen
  // (Header/Navi/Filter), sondern weiter unten. Je Fenster ein Call.
  const windows = [markdown.slice(0, 4500), markdown.slice(4500, 9000)].filter(w => w.trim().length > 500)
  const jobs: CrawledJob[] = []
  const notes: string[] = []
  let error: string | undefined
  for (const [i, win] of windows.entries()) {
    const r = await geminiWindow(win, portalName, apiKey)
    jobs.push(...r.jobs)
    if (r.note) notes.push(`w${i}:${r.note}`)
    if (r.error && !error) error = r.error
  }
  return { jobs, error, note: notes.join(' ') || undefined }
}

async function geminiWindow(
  text: string,
  portalName: string,
  apiKey: string,
): Promise<{ jobs: CrawledJob[]; error?: string; note?: string }> {
  const prompt = `Job-Portal: ${portalName}. Extrahiere ALLE Stellenangebote für Design, Interior, Architektur, Retail, Marketing, Projektmanagement aus dem folgenden Seitenausschnitt (Stellen können überall im Text stehen).
Antworte NUR mit JSON-Array, kein Text:
[{"titel":"...","unternehmen":"...","ort":"...","url":"https://..."}]
Leeres Array [] wenn keine passenden Stellen gefunden.
Seite:\n${text}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25000)
  try {
    const r = await fetch(
      geminiUrl(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
        signal: ctrl.signal,
      }
    )
    clearTimeout(t)
    if (!r.ok) {
      const body = await r.text().then(s => s.slice(0, 200)).catch(() => '')
      return { jobs: [], error: `Gemini HTTP ${r.status}: ${body}` }
    }
    const data = await r.json()
    const cand = data?.candidates?.[0]
    const raw = cand?.content?.parts?.[0]?.text
    const note = `finish=${cand?.finishReason || '?'} raw_len=${(raw || '').length} blocked=${data?.promptFeedback?.blockReason || 'no'}`
    let arr: unknown
    try {
      arr = JSON.parse(raw || '[]')
    } catch {
      return { jobs: [], error: `Gemini JSON-Parse fail: ${(raw || '').slice(0, 120)}`, note }
    }
    return Array.isArray(arr)
      ? {
          jobs: arr.filter((j: any) => j.titel && PORTAL_RELEVANZ.test(j.titel)).map((j: any) => ({
            titel: j.titel, unternehmen: j.unternehmen || '', ort: j.ort || STANDORT,
            plz: '', datum: new Date().toISOString().slice(0, 10), url: j.url || '', quelle: portalName,
            beschreibung: '', arbeitszeit: '', kategorie: classifyJob(j.titel),
          })),
          note: `${note} parsed=${arr.length}`,
        }
      : { jobs: [], error: 'Gemini: kein Array', note }
  } catch (e) {
    clearTimeout(t)
    return { jobs: [], error: `Gemini exception: ${String(e).slice(0, 150)}` }
  }
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
      const { jobs, error, note } = await geminiExtract(md, name, geminiKey)
      return { name, jobs, mdLen: md.length, mdSnippet: md.slice(0, 120), geminiError: error, geminiNote: note }
    })
  )

  const allJobs: CrawledJob[] = []
  const bySource: Record<string, number> = {}
  const debug: Record<string, { chars: number; snippet: string; gemini_error?: string; gemini_note?: string }> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allJobs.push(...r.value.jobs)
      bySource[r.value.name] = r.value.jobs.length
      debug[r.value.name] = {
        chars: r.value.mdLen,
        snippet: r.value.mdSnippet,
        ...(r.value.geminiError ? { gemini_error: r.value.geminiError } : {}),
        ...(r.value.geminiNote ? { gemini_note: r.value.geminiNote } : {}),
      }
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
