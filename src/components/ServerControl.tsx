import { useEffect, useRef, useState } from 'react'
import { Play, Square, RefreshCw, Zap, Wifi, WifiOff, Terminal } from 'lucide-react'

const LAUNCHER = 'http://localhost:8001'
const BACKEND  = 'http://localhost:8000'

interface ServerStatus { running: boolean; pid: number | null }

const s = {
  card: (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 'var(--r)',
    border: `1px solid ${color}33`, background: `${color}0d`,
    marginBottom: 10,
  }),
  btn: (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: '10px 0', borderRadius: 'var(--r)',
    fontSize: 13, fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed',
    background: active ? color : 'var(--ink-4)',
    color: active ? '#fff' : 'var(--fog)',
    opacity: active ? 1 : 0.5, transition: 'all 0.15s',
  }),
  label: { fontSize: 10, color: 'var(--fog)', letterSpacing: '0.6px', textTransform: 'uppercase' as const, marginBottom: 10 },
  hint: { fontSize: 11, color: 'var(--fog-2)', marginTop: 2 },
}

export default function ServerControl() {
  const [status, setStatus]       = useState<ServerStatus | null>(null)
  const [launcherOk, setLauncherOk] = useState<boolean | null>(null)
  const [loading, setLoading]     = useState(false)
  const [msg, setMsg]             = useState('')
  const [logs, setLogs]           = useState<string[]>([])
  const [showLogs, setShowLogs]   = useState(false)
  const logRef                    = useRef<HTMLDivElement>(null)

  const check = async () => {
    try {
      const r = await fetch(`${LAUNCHER}/status`, { signal: AbortSignal.timeout(2000) })
      if (r.ok) { setLauncherOk(true); setStatus(await r.json()); return }
    } catch {}
    setLauncherOk(false); setStatus(null)
  }

  const fetchLogs = async () => {
    try {
      const r = await fetch(`${LAUNCHER}/logs`)
      if (r.ok) { const d = await r.json(); setLogs(d.lines || []) }
    } catch {}
  }

  useEffect(() => { check(); const iv = setInterval(check, 5000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    if (!showLogs) return
    fetchLogs()
    const iv = setInterval(fetchLogs, 3000)
    return () => clearInterval(iv)
  }, [showLogs])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const action = async (a: 'start' | 'stop') => {
    setLoading(true); setMsg('')
    try {
      const r = await fetch(`${LAUNCHER}/${a}`, { method: 'POST' })
      const d = await r.json()
      setMsg(d.msg || '')
      setTimeout(check, 1000)
    } catch { setMsg('Launcher nicht erreichbar') }
    finally { setLoading(false) }
  }

  const discovery = async () => {
    try {
      const r = await fetch(`${BACKEND}/api/queue/run-discovery`, { method: 'POST' })
      setMsg(r.ok ? 'Discovery Agent gestartet' : 'Backend nicht erreichbar')
    } catch { setMsg('Backend nicht erreichbar') }
  }

  const runJobSpy = async () => {
    try {
      const r = await fetch(`${BACKEND}/api/queue/run-jobspy`, { method: 'POST' })
      setMsg(r.ok ? 'JobSpy gestartet — LinkedIn, Indeed, Glassdoor, Google Jobs' : 'Backend nicht erreichbar')
    } catch { setMsg('Backend nicht erreichbar') }
  }

  return (
    <div style={{ minWidth: 280, maxWidth: 340 }}>
      <div style={s.label}>🖥 Server Control</div>

      {/* Launcher */}
      <div style={s.card(launcherOk ? '#22c55e' : '#ef4444')}>
        {launcherOk
          ? <Wifi size={16} color="#22c55e" />
          : <WifiOff size={16} color="#ef4444" />}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Launcher {launcherOk ? 'aktiv' : 'nicht erreichbar'}
          </div>
          <div style={s.hint}>
            {launcherOk ? 'localhost:8001' : 'start_launcher.bat ausführen'}
          </div>
        </div>
      </div>

      {/* Backend */}
      {launcherOk && (
        <div style={s.card(status?.running ? '#3b82f6' : '#6b7280')}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: status?.running ? '#3b82f6' : '#6b7280',
            boxShadow: status?.running ? '0 0 6px #3b82f6' : 'none',
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Backend {status?.running ? 'läuft' : 'gestoppt'}
            </div>
            <div style={s.hint}>
              {status?.running ? `localhost:8000 — PID ${status.pid}` : 'localhost:8000 — inaktiv'}
            </div>
          </div>
          <button onClick={check} style={{ marginLeft: 'auto', color: 'var(--fog)', padding: 4 }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {/* Start / Stop */}
      {launcherOk && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => action('start')}
            disabled={loading || !!status?.running}
            style={s.btn(!status?.running && !loading, '#16a34a')}
          >
            <Play size={13} /> Starten
          </button>
          <button
            onClick={() => action('stop')}
            disabled={loading || !status?.running}
            style={s.btn(!!status?.running && !loading, '#dc2626')}
          >
            <Square size={13} /> Stoppen
          </button>
        </div>
      )}

      {/* Discovery + JobSpy */}
      {status?.running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <button onClick={discovery} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '9px 0', borderRadius: 'var(--radius-sm)',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            background: 'var(--accent-soft)', color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
          }}>
            <Zap size={13} /> Discovery Agent
          </button>
          <button onClick={runJobSpy} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '9px 0', borderRadius: 'var(--radius-sm)',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            background: '#e7f5ec', color: '#1f7a45',
            border: '1px solid #bfe6cd',
          }}>
            <Zap size={13} /> JobSpy — LinkedIn · Indeed · Google
          </button>
        </div>
      )}

      {/* Message */}
      {msg && <p style={{ fontSize: 11, color: 'var(--fog)', textAlign: 'center' }}>{msg}</p>}

      {/* Log Toggle */}
      {launcherOk && (
        <button onClick={() => setShowLogs(v => !v)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '7px 0', borderRadius: 'var(--r)', marginBottom: 10,
          fontSize: 12, cursor: 'pointer',
          background: 'var(--ink-3)', color: 'var(--fog-2)',
          border: '1px solid var(--ink-5)',
        }}>
          <Terminal size={12} /> {showLogs ? 'Log ausblenden' : 'Log anzeigen'}
        </button>
      )}

      {/* Log Viewer */}
      {showLogs && (
        <div ref={logRef} style={{
          background: '#0a0a0a', borderRadius: 'var(--r)',
          border: '1px solid var(--ink-5)',
          height: 220, overflowY: 'auto', padding: '8px 10px',
          marginBottom: 10, fontFamily: 'monospace', fontSize: 10,
          lineHeight: 1.6, color: '#a0a0a0',
        }}>
          {logs.length === 0
            ? <span style={{ color: 'var(--fog)' }}>Keine Logs vorhanden</span>
            : logs.map((line, i) => (
              <div key={i} style={{
                color: line.includes('ERROR') ? '#f87171'
                  : line.includes('WARNING') ? '#fb923c'
                  : line.includes('INFO') ? '#86efac'
                  : '#a0a0a0'
              }}>{line}</div>
            ))
          }
        </div>
      )}

      {/* Setup hint */}
      {launcherOk === false && (
        <div style={{ padding: '10px 12px', background: 'var(--ink-3)', borderRadius: 'var(--r)', border: '1px solid var(--ink-5)', marginTop: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 6, fontWeight: 600 }}>Einmalig starten:</p>
          <code style={{ fontSize: 11, color: 'var(--paper)', display: 'block', lineHeight: 1.8 }}>
            cd jobscout-backend<br />
            start_launcher.bat
          </code>
        </div>
      )}
    </div>
  )
}
