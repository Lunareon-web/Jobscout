import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { jobs, config, log } = req.body

    // Speichere Search Run
    const { data: run, error: runError } = await supabase
      .from('search_runs')
      .insert({ config, result_count: jobs.length, sources_log: log })
      .select()
      .single()

    if (runError) throw runError

    // Speichere Jobs in Batches
    const BATCH = 50
    for (let i = 0; i < jobs.length; i += BATCH) {
      const batch = jobs.slice(i, i + BATCH).map((j: any) => ({
        id: j.id || `${j.titel}-${j.unternehmen}-${j.url}`.slice(0, 50),
        titel: j.titel,
        unternehmen: j.unternehmen,
        ort: j.ort,
        plz: j.plz || null,
        datum: j.datum || null,
        url: j.url,
        quelle: j.quelle,
        beschreibung: j.beschreibung || null,
        arbeitszeit: j.arbeitszeit || null,
        kategorie: j.kategorie || 'sonstiges',
        search_run_id: run.id,
      }))

      const { error } = await supabase.from('jobs').upsert(batch, { onConflict: 'id' })
      if (error) console.error('Batch insert error:', error)
    }

    return res.status(200).json({ ok: true, run_id: run.id, synced: jobs.length })
  } catch (err) {
    console.error('Sync error:', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
}
