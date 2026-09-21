import type { VercelRequest, VercelResponse } from '@vercel/node'
import { geminiUrl } from './_lib/gemini'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const key = req.body?.key || ''
  if (!key) return res.status(200).json({ valid: false, reason: 'no key' })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    let r: Response
    try {
      r = await fetch(
        geminiUrl(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }),
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timer)
    }
    // 401/403 = key invalid; everything else (200, 400, 429) = key reached API → valid
    const valid = r.status !== 401 && r.status !== 403
    return res.status(200).json({ valid, status: r.status })
  } catch (e) {
    return res.status(200).json({ valid: false, reason: String(e) })
  }
}
