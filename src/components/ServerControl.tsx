import { useState } from 'react'
import { Play, CheckCircle, XCircle, Loader } from 'lucide-react'

interface CrawlResult {
  ok: boolean
  fetched: number
  inserted: number
  error?: string
}

type Status = 'idle' | 'running' | 'done' | 'error'

interface SourceState {
  status: Status
  result?: CrawlResult
}

const SOURCES = [
  { key: 'ba',           label: 'Bundesagentur für Arbeit',  desc: 'BA-API + KldB-Berufsgruppen',              path: '/api/cron/ba' },
  { key: 'portals',      label: 'Portale',                   desc: 'Kimeta · Indeed · Karriere · StepStone',   path: '/api/cron/portals' },
  { key: 'firmenseiten', label: 'Firmenseiten direkt',       desc: '20 Unternehmens-Karriereseiten',           path: '/api/cron/firmenseiten' },
]

async function runCrawler(path: string): Promise<CrawlResult> {
  const r = await fetch(path, { signal: AbortSignal.timeout(62_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function ServerControl() {
  const [sources, setSources] = useState<Record<string, SourceState>>(
    Object.fromEntries(SOURCES.map(s => [s.key, { status: 'idle' as Status }]))
  )
  const [running, setRunning] = useState(false)

  const setSource = (key: string, patch: Partial<SourceState>) =>
    setSources(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const startAll = async () => {
    setRunning(true)
    SOURCES.forEach(s => setSource(s.key, { status: 'running', result: undefined }))

    await Promise.allSettled(
      SOURCES.map(async s => {
        try {
          const result = await runCrawler(s.path)
          setSource(s.key, { status: result.ok ? 'done' : 'error', result })
        } catch (e) {
          setSource(s.key, {
            status: 'error',
            result: { ok: false, fetched: 0, inserted: 0, error: String(e) },
          })
        }
      })
    )
    setRunning(false)
  }

  const totalFetched  = Object.values(sources).reduce((n, s) => n + (s.result?.fetched  ?? 0), 0)
  const totalInserted = Object.values(sources).reduce((n, s) => n + (s.result?.inserted ?? 0), 0)
  const anyDone = Object.values(sources).some(s => s.status === 'done' || s.status === 'error')

  return (
    <div style={{ minWidth: 300, maxWidth: 380 }}>
      <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>
        Manueller Crawl
      </div>

      {/* Source cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {SOURCES.map(s => {
          const st = sources[s.key]
          const borderColor =
            st.status === 'done'    ? '#bfe6cd' :
            st.status === 'error'   ? '#fca5a5' :
            st.status === 'running' ? 'var(--accent-border)' :
            'var(--border)'
          const bg =
            st.status === 'done'    ? '#f0faf4' :
            st.status === 'error'   ? '#fef2f2' :
            st.status === 'running' ? 'var(--accent-soft)' :
            'var(--bg)'

          return (
            <div key={s.key} style={{ padding: '12px 14px', borderRadius: 'var(--radius)', border: `1px solid ${borderColor}`, background: bg, transition: 'all .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.desc}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {st.status === 'idle'    && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--txt3)' }} />}
                  {st.status === 'running' && <Loader size={15} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {st.status === 'done'    && <CheckCircle size={15} color="#16a34a" />}
                  {st.status === 'error'   && <XCircle size={15} color="#dc2626" />}
                </div>
              </div>

              {st.result && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--txt2)', display: 'flex', gap: 14 }}>
                  {st.result.ok ? (
                    <>
                      <span>Gefunden: <strong>{st.result.fetched}</strong></span>
                      <span>Neu in DB: <strong style={{ color: '#16a34a' }}>{st.result.inserted}</strong></span>
                    </>
                  ) : (
                    <span style={{ color: '#dc2626' }}>{st.result.error || 'Fehler'}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      {anyDone && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Gefunden</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.5px' }}>{totalFetched}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Neu in DB</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.5px' }}>{totalInserted}</div>
          </div>
        </div>
      )}

      {/* Button */}
      <button
        onClick={startAll}
        disabled={running}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '12px 0', borderRadius: 'var(--radius-sm)',
          fontSize: 14, fontWeight: 700,
          cursor: running ? 'not-allowed' : 'pointer',
          background: running ? 'var(--bg3)' : 'var(--accent)',
          color: running ? 'var(--txt3)' : '#fff',
          border: 'none',
          boxShadow: running ? 'none' : '0 4px 12px -3px rgba(79,70,229,.4)',
          transition: 'all .2s',
        }}
      >
        {running
          ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Crawl läuft…</>
          : <><Play size={15} fill="currentColor" /> Alle Quellen crawlen</>
        }
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
