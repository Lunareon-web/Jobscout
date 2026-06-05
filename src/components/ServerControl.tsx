import { useState, useEffect } from 'react'
import { Play, CheckCircle, XCircle, Loader, Wifi, WifiOff, Zap } from 'lucide-react'

const BACKEND = 'http://localhost:8000'

interface CrawlResult {
  ok: boolean
  fetched?: number
  inserted?: number
  msg?: string
  error?: string
}

type Status = 'idle' | 'running' | 'done' | 'error'

interface SourceState {
  status: Status
  result?: CrawlResult
}

// ── Vercel-seitige Crawler (kein lokaler Server nötig) ────────────────────────
const VERCEL_SOURCES = [
  { key: 'ba',           label: 'Bundesagentur für Arbeit',   desc: 'BA-API + KldB-Berufsgruppen',                path: '/api/cron/ba',           isPost: false },
  { key: 'portals',      label: 'Portale (RSS)',              desc: 'Kimeta · Indeed · Karriere · StepStone',     path: '/api/cron/portals',      isPost: false },
  { key: 'firmenseiten', label: 'Firmenseiten (DB)',          desc: 'Alle Firmen aus crawl_companies crawlen',    path: '/api/cron/firmenseiten', isPost: false },
  { key: 'discover',     label: 'Neue Firmen entdecken',      desc: 'Firmennamen aus BA → crawl_companies',       path: '/api/cron/discover',     isPost: false },
]

// ── Lokale Crawl4AI Agents (brauchen laufendes Python-Backend) ────────────────
const LOCAL_SOURCES = [
  { key: 'portal_crawl',      label: 'Portale (echter Browser)',    desc: 'Indeed · StepStone · Kimeta mit Playwright',     path: `${BACKEND}/api/queue/run-portals` },
  { key: 'deep_firmenseiten', label: 'Firmenseiten Deep Crawl',     desc: 'JS-SPAs mit Playwright + Ollama/Gemma',          path: `${BACKEND}/api/queue/run-deep-firmenseiten` },
  { key: 'company_discovery', label: 'Career URLs entdecken',       desc: 'career_url für neue Firmen automatisch finden',  path: `${BACKEND}/api/queue/run-company-discovery` },
]

async function runCrawler(path: string, isPost = false): Promise<CrawlResult> {
  const r = await fetch(path, {
    method: isPost ? 'POST' : 'GET',
    signal: AbortSignal.timeout(62_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function SourceCard({ s, state }: { s: typeof VERCEL_SOURCES[0] | typeof LOCAL_SOURCES[0]; state: SourceState }) {
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
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt2)', display: 'flex', gap: 12 }}>
          {state.result.ok !== false ? (
            <>
              {state.result.fetched !== undefined && <span>Gefunden: <strong>{state.result.fetched}</strong></span>}
              {state.result.inserted !== undefined && <span>Neu in DB: <strong style={{ color: '#16a34a' }}>{state.result.inserted}</strong></span>}
              {state.result.msg && !state.result.fetched && <span style={{ color: '#16a34a' }}>{state.result.msg}</span>}
            </>
          ) : (
            <span style={{ color: '#dc2626' }}>{state.result.error || 'Fehler'}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ServerControl() {
  const [vercelStates, setVercelStates] = useState<Record<string, SourceState>>(
    Object.fromEntries(VERCEL_SOURCES.map(s => [s.key, { status: 'idle' as Status }]))
  )
  const [localStates, setLocalStates] = useState<Record<string, SourceState>>(
    Object.fromEntries(LOCAL_SOURCES.map(s => [s.key, { status: 'idle' as Status }]))
  )
  const [vercelRunning, setVercelRunning] = useState(false)
  const [localRunning, setLocalRunning] = useState(false)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)

  // Backend-Erreichbarkeit prüfen
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(2000) })
        setBackendOnline(r.ok)
      } catch {
        setBackendOnline(false)
      }
    }
    check()
    const iv = setInterval(check, 10_000)
    return () => clearInterval(iv)
  }, [])

  const setV = (key: string, patch: Partial<SourceState>) =>
    setVercelStates(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  const setL = (key: string, patch: Partial<SourceState>) =>
    setLocalStates(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const runAllVercel = async () => {
    setVercelRunning(true)
    VERCEL_SOURCES.forEach(s => setV(s.key, { status: 'running', result: undefined }))
    await Promise.allSettled(
      VERCEL_SOURCES.map(async s => {
        try {
          const result = await runCrawler(s.path, s.isPost)
          setV(s.key, { status: result.ok !== false ? 'done' : 'error', result })
        } catch (e) {
          setV(s.key, { status: 'error', result: { ok: false, error: String(e) } })
        }
      })
    )
    setVercelRunning(false)
  }

  const runAllLocal = async () => {
    if (!backendOnline) return
    setLocalRunning(true)
    // Lokal sequenziell (Browser-Ressourcen)
    for (const s of LOCAL_SOURCES) {
      setL(s.key, { status: 'running', result: undefined })
      try {
        const result = await fetch(s.path, { method: 'POST', signal: AbortSignal.timeout(62_000) })
        const data = result.ok ? await result.json() : { ok: false, error: `HTTP ${result.status}` }
        setL(s.key, { status: data.ok !== false ? 'done' : 'error', result: data })
      } catch (e) {
        setL(s.key, { status: 'error', result: { ok: false, error: String(e) } })
      }
    }
    setLocalRunning(false)
  }

  const vercelTotal = {
    fetched:  Object.values(vercelStates).reduce((n, s) => n + (s.result?.fetched  ?? 0), 0),
    inserted: Object.values(vercelStates).reduce((n, s) => n + (s.result?.inserted ?? 0), 0),
  }
  const anyVercelDone = Object.values(vercelStates).some(s => s.status === 'done' || s.status === 'error')

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
      {text}
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

      {/* ── Vercel Crawler ─────────────────────────────────────────── */}
      <div style={{ minWidth: 290, maxWidth: 360 }}>
        {sectionLabel('Vercel Crawler')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
          {VERCEL_SOURCES.map(s => <SourceCard key={s.key} s={s} state={vercelStates[s.key]} />)}
        </div>
        {anyVercelDone && (
          <div style={{ padding: '9px 12px', borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 10, display: 'flex', gap: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700 }}>Gefunden</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.5px' }}>{vercelTotal.fetched}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700 }}>Neu in DB</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.5px' }}>{vercelTotal.inserted}</div>
            </div>
          </div>
        )}
        <button onClick={runAllVercel} disabled={vercelRunning} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 7, padding: '11px 0', borderRadius: 'var(--radius-sm)',
          fontSize: 13.5, fontWeight: 700,
          cursor: vercelRunning ? 'not-allowed' : 'pointer',
          background: vercelRunning ? 'var(--bg3)' : 'var(--accent)',
          color: vercelRunning ? 'var(--txt3)' : '#fff',
          border: 'none',
          boxShadow: vercelRunning ? 'none' : '0 4px 12px -3px rgba(79,70,229,.4)',
          transition: 'all .2s',
        }}>
          {vercelRunning
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Crawl läuft…</>
            : <><Play size={14} fill="currentColor" /> Alle Vercel-Quellen</>
          }
        </button>
      </div>

      {/* ── Lokaler Deep-Crawler (Crawl4AI + Ollama) ───────────────── */}
      <div style={{ minWidth: 290, maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {sectionLabel('Lokaler Deep-Crawler')}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 600, marginTop: -8,
            color: backendOnline ? '#16a34a' : backendOnline === false ? '#dc2626' : 'var(--txt3)',
          }}>
            {backendOnline === null ? null :
             backendOnline
               ? <><Wifi size={11} /> Backend online</>
               : <><WifiOff size={11} /> Backend offline</>
            }
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
          {LOCAL_SOURCES.map(s => <SourceCard key={s.key} s={s} state={localStates[s.key]} />)}
        </div>

        {!backendOnline && (
          <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 10 }}>
            <p style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 6, fontWeight: 600 }}>
              Einmalig einrichten:
            </p>
            <code style={{ fontSize: 11, color: 'var(--accent)', display: 'block', lineHeight: 1.9 }}>
              cd jobscout-backend<br />
              setup_crawl4ai.bat<br />
              start.bat
            </code>
          </div>
        )}

        <button onClick={runAllLocal} disabled={!backendOnline || localRunning} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 7, padding: '11px 0', borderRadius: 'var(--radius-sm)',
          fontSize: 13.5, fontWeight: 700,
          cursor: (!backendOnline || localRunning) ? 'not-allowed' : 'pointer',
          background: !backendOnline ? 'var(--bg3)' : localRunning ? 'var(--bg3)' : '#1f7a45',
          color: (!backendOnline || localRunning) ? 'var(--txt3)' : '#fff',
          border: 'none',
          boxShadow: backendOnline && !localRunning ? '0 4px 12px -3px rgba(22,163,74,.4)' : 'none',
          transition: 'all .2s',
        }}>
          {localRunning
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Läuft…</>
            : <><Zap size={14} /> Deep Crawl (Playwright + Ollama)</>
          }
        </button>
        {backendOnline && (
          <p style={{ fontSize: 10.5, color: 'var(--txt3)', textAlign: 'center', marginTop: 6 }}>
            Echter Browser · Kein IP-Blocking · JS-SPAs · Gemma-Extraktion
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
