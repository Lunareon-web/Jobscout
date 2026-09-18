import { useState, useRef, useEffect } from 'react'
import { Play, CheckCircle, XCircle, Loader, Key } from 'lucide-react'

const GEMINI_KEY_STORAGE = 'jobscout_gemini_key'

interface CrawlResult {
  ok: boolean
  fetched?: number
  inserted?: number
  deleted?: number
  msg?: string
  error?: string
  by_source?: Record<string, number>
}

type Status = 'idle' | 'running' | 'done' | 'error'
type KeyStatus = 'unknown' | 'checking' | 'valid' | 'invalid'

interface SourceState {
  status: Status
  result?: CrawlResult
}

const SOURCES = [
  { key: 'ba',           label: 'Bundesagentur für Arbeit', desc: 'BA-API + KldB-Berufsgruppen',               path: '/api/cron/ba',           method: 'GET' },
  { key: 'portals',      label: 'Portale (RSS + Jina)',      desc: 'Karriere · StepStone · Kimeta + Indeed via Jina', path: '/api/cron/portals', method: 'POST' },
  { key: 'firmenseiten', label: 'Firmenseiten',             desc: 'ATS · JSON-LD · Jina + Gemini (JS-SPAs)',   path: '/api/cron/firmenseiten', method: 'POST' },
  { key: 'linkedin',     label: 'LinkedIn',                 desc: 'Guest-Scraping via linkedin-jobs-api (kein Key)', path: '/api/cron/linkedin', method: 'GET' },
  { key: 'discover',     label: 'Neue Firmen entdecken',    desc: 'Firmennamen aus BA → crawl_companies',      path: '/api/cron/discover',     method: 'GET' },
  { key: 'cleanup',      label: 'Alte Stellen löschen (>30 Tage)', desc: 'Hard-Delete aus DB (täglich 07:00 auto)', path: '/api/cron/cleanup?max_tage=30', method: 'GET' },
]

function SourceCard({ s, state }: { s: typeof SOURCES[0]; state: SourceState }) {
  const borderColor =
    state.status === 'done'    ? '#bfe6cd' :
    state.status === 'error'   ? '#fca5a5' :
    state.status === 'running' ? 'var(--accent-border)' :
    'var(--border)'
  const bg =
    state.status === 'done'    ? '#f0faf4' :
    state.status === 'error'   ? '#fef2f2' :
    state.status === 'running' ? 'var(--accent-soft)' :
    'var(--bg)'

  return (
    <div style={{ padding: '11px 13px', borderRadius: 'var(--radius)', border: `1px solid ${borderColor}`, background: bg, transition: 'all .2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', marginBottom: 1 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.desc}</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {state.status === 'idle'    && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt3)' }} />}
          {state.status === 'running' && <Loader size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
          {state.status === 'done'    && <CheckCircle size={14} color="#16a34a" />}
          {state.status === 'error'   && <XCircle size={14} color="#dc2626" />}
        </div>
      </div>
      {state.result && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt2)' }}>
          {state.result.ok !== false ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {state.result.fetched !== undefined && <span>Gefunden: <strong>{state.result.fetched}</strong></span>}
              {state.result.inserted !== undefined && <span>Neu in DB: <strong style={{ color: '#16a34a' }}>{state.result.inserted}</strong></span>}
              {state.result.deleted !== undefined && state.result.deleted > 0 && <span>Gelöscht: <strong style={{ color: '#dc2626' }}>{state.result.deleted}</strong></span>}
              {state.result.msg && !state.result.fetched && <span style={{ color: '#16a34a' }}>{state.result.msg}</span>}
              {state.result.by_source && (
                <span style={{ color: 'var(--txt3)', fontSize: 10 }}>
                  {Object.entries(state.result.by_source).map(([k, v]) => `${k}:${v}`).join(' · ')}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: '#dc2626' }}>{state.result.error || 'Fehler'}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ServerControl() {
  const [states, setStates] = useState<Record<string, SourceState>>(
    Object.fromEntries(SOURCES.map(s => [s.key, { status: 'idle' as Status }]))
  )
  const [running, setRunning] = useState(false)
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('unknown')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const validateGeminiKey = async (key: string) => {
    if (!key || key.length < 10) { setKeyStatus('unknown'); return }
    setKeyStatus('checking')
    try {
      const r = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(10_000),
      })
      const data = await r.json()
      setKeyStatus(data.valid ? 'valid' : 'invalid')
    } catch {
      setKeyStatus('invalid')
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(GEMINI_KEY_STORAGE)
    if (stored) validateGeminiKey(stored)
  }, [])

  const set = (key: string, patch: Partial<SourceState>) =>
    setStates(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const runAll = async () => {
    setRunning(true)
    const key = localStorage.getItem(GEMINI_KEY_STORAGE) || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key) headers['X-Gemini-Key'] = key

    SOURCES.forEach(s => set(s.key, { status: 'running', result: undefined }))

    await Promise.allSettled(
      SOURCES.map(async s => {
        try {
          const opts: RequestInit = {
            method: s.method,
            signal: AbortSignal.timeout(62_000),
          }
          if (s.method === 'POST') {
            opts.headers = { 'Content-Type': 'application/json' }
            opts.body = JSON.stringify({ gemini_key: key })
          }
          const r = await fetch(s.path, opts)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const result = await r.json()
          set(s.key, { status: result.ok !== false ? 'done' : 'error', result })
        } catch (e) {
          set(s.key, { status: 'error', result: { ok: false, error: String(e) } })
        }
      })
    )
    setRunning(false)
  }

  const handleKeyChange = (val: string) => {
    setGeminiKey(val)
    setKeyStatus('unknown')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(GEMINI_KEY_STORAGE, val)
      checkTimer.current = setTimeout(() => validateGeminiKey(val), 200)
    }, 600)
  }

  const total = {
    fetched:  Object.values(states).reduce((n, s) => n + (s.result?.fetched  ?? 0), 0),
    inserted: Object.values(states).reduce((n, s) => n + (s.result?.inserted ?? 0), 0),
  }
  const anyDone = Object.values(states).some(s => s.status === 'done' || s.status === 'error')

  return (
    <div style={{ maxWidth: 380 }}>
      <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
        Crawler
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
        {SOURCES.map(s => <SourceCard key={s.key} s={s} state={states[s.key]} />)}
      </div>

      {anyDone && (
        <div style={{ padding: '9px 12px', borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 10, display: 'flex', gap: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700 }}>Gefunden</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.5px' }}>{total.fetched}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700 }}>Neu in DB</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.5px' }}>{total.inserted}</div>
          </div>
        </div>
      )}

      <button onClick={runAll} disabled={running} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 7, padding: '11px 0', borderRadius: 'var(--radius-sm)',
        fontSize: 13.5, fontWeight: 700,
        cursor: running ? 'not-allowed' : 'pointer',
        background: running ? 'var(--bg3)' : 'var(--accent)',
        color: running ? 'var(--txt3)' : '#fff',
        border: 'none',
        boxShadow: running ? 'none' : '0 4px 12px -3px rgba(79,70,229,.4)',
        transition: 'all .2s',
      }}>
        {running
          ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Crawl läuft…</>
          : <><Play size={14} fill="currentColor" /> Alle Quellen starten</>
        }
      </button>

      {/* ── Gemini API Key ─────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
          Gemini API Key <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(für JS-SPA Crawl)</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)', pointerEvents: 'none' }}>
            <Key size={12} />
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={e => handleKeyChange(e.target.value)}
            placeholder="AIza…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 32px 8px 28px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg2)',
              color: 'var(--txt)',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            {keyStatus === 'checking' && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1s ease-in-out infinite' }} />
            )}
            {keyStatus === 'valid' && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
            )}
            {keyStatus === 'invalid' && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            )}
            {keyStatus === 'unknown' && geminiKey.length > 0 && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--txt3)' }} />
            )}
          </div>
        </div>
        <p style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
          Kostenlos via <span style={{ color: 'var(--accent)' }}>aistudio.google.com</span> · 1500 Req/Tag
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
      `}</style>
    </div>
  )
}
