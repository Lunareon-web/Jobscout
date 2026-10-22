/**
 * Company Discovery Agent (schnell, kein Timeout)
 * Extrahiert neue Firmennamen aus den BA-Job-Ergebnissen
 * und speichert sie in crawl_companies.
 * career_url wird beim nÃ¤chsten Firmenseiten-Crawl gesucht.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../../_lib/db'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // 1. Bekannte Firmennamen aus crawl_companies laden
  const { data: existing } = await db
    .from('crawl_companies')
    .select('name')
    .limit(5000)

  const knownNames = new Set((existing || []).map((r: any) => r.name.toLowerCase().trim()))

  // 2. Alle Firmennamen aus jobs-Tabelle (letzten 30 Tage)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: jobRows } = await db
    .from('jobs')
    .select('unternehmen, ort')
    .gte('found_at', since)
    .neq('unternehmen', '')
    .limit(5000)

  if (!jobRows?.length) {
    return res.status(200).json({ ok: true, discovered: 0, msg: 'Keine Jobs in DB' })
  }

  // 3. Unique neue Firmennamen
  const newFirmen: Map<string, { name: string; city: string }> = new Map()
  for (const row of jobRows) {
    const name = (row.unternehmen || '').trim()
    if (!name || name.length < 3) continue
    if (knownNames.has(name.toLowerCase())) continue
    // Firmen mit generischen Namen Ã¼berspringen
    if (/^(nicht|anonym|n\.n\.|unbekannt|confidential)/i.test(name)) continue
    if (!newFirmen.has(name.toLowerCase())) {
      newFirmen.set(name.toLowerCase(), { name, city: row.ort || '' })
    }
  }

  if (!newFirmen.size) {
    return res.status(200).json({ ok: true, discovered: 0, msg: 'Alle Firmen bereits bekannt' })
  }

  // 4. Neue Firmen in Batches einfÃ¼gen (max 100 pro Run)
  const toInsert = [...newFirmen.values()].slice(0, 100)
  let inserted = 0

  for (const firma of toInsert) {
    const { error } = await db.from('crawl_companies').insert({
      name: firma.name,
      city: firma.city || null,
      source: 'ba',
      is_active: true,
    })
    if (!error) inserted++
  }

  return res.status(200).json({
    ok: true,
    new_in_jobs: newFirmen.size,
    inserted,
    sample: toInsert.slice(0, 15).map(f => f.name),
    ts: new Date().toISOString(),
  })
}


