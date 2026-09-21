import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_lib/db'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const url = process.env.SUPABASE_URL || '(not set)'
  const keySet = !!(process.env.SUPABASE_SERVICE_KEY)

  try {
    const { data, error } = await db.from('jobs').select('id').limit(1)
    return res.status(200).json({
      ok: !error,
      supabase_url: url.replace(/https:\/\/([^.]+)\..*/, 'https://$1.supabase.co'),
      service_key_set: keySet,
      db_error: error ? `${error.message} (code: ${error.code})` : null,
      db_rows: data?.length ?? 0,
    })
  } catch (e) {
    return res.status(200).json({
      ok: false,
      supabase_url: url.replace(/https:\/\/([^.]+)\..*/, 'https://$1.supabase.co'),
      service_key_set: keySet,
      exception: String(e),
    })
  }
}
