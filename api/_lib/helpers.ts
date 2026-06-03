export function stripHtml(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

export function parsePubDate(s: string): string {
  if (!s) return ''
  try {
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  } catch { return '' }
}

export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
}

export async function safeFetch(url: string, opts: RequestInit = {}, ms = 12000): Promise<string> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetch(url, { ...opts, signal: ctrl.signal })
    clearTimeout(t)
    return r.ok ? r.text() : ''
  } catch { return '' }
}
