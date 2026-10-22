import { Search, Download, Settings, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import type { SearchPhase } from '../types'

const PHASE_LABELS: Record<SearchPhase, string> = {
  idle:    '',
  fast:    'Stufe 1/5 — Bundesagentur…',
  portals: 'Stufe 2/5 — Portale + Jina…',
  firmen:  'Stufe 3/5 — Firmenseiten…',
  linkedin: 'Stufe 4/5 — LinkedIn…',
  jooble:  'Stufe 5/5 — Jooble…',
  done:    '',
  error:   'Fehler',
}

interface Props {
  onSearch: () => void
  onSettings: () => void
  onExport: () => void
  onReloadDb: () => void
  dbLoading: boolean
}

export function Topbar({ onSearch, onSettings, onExport, onReloadDb, dbLoading }: Props) {
  const { searchPhase, jobs, lastSearchAt } = useStore()
  const isRunning = searchPhase !== 'idle' && searchPhase !== 'done' && searchPhase !== 'error'
  const phaseLabel = PHASE_LABELS[searchPhase]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255,255,255,.82)',
      backdropFilter: 'saturate(180%) blur(14px)',
      WebkitBackdropFilter: 'saturate(180%) blur(14px)',
      borderBottom: '1px solid var(--border)',
      height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: 'linear-gradient(145deg, var(--accent), #6d63f0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px -2px rgba(79,70,229,.45)',
        }}>
          <Search size={18} color="#fff" strokeWidth={2.5} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--txt)' }}>JobScout</div>
          <div style={{ fontSize: 11.5, color: 'var(--txt3)', fontWeight: 500, whiteSpace: 'nowrap' }}>Düsseldorf · Kreativ &amp; Architektur</div>
        </div>

        {/* Progress indicator */}
        {isRunning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--accent-soft)', borderRadius: 99,
            padding: '4px 12px', fontSize: 11.5, color: 'var(--accent)',
            marginLeft: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            {phaseLabel}
          </div>
        )}

        {searchPhase === 'done' && lastSearchAt && (
          <div style={{
            fontSize: 11.5, color: 'var(--txt3)', fontWeight: 500,
            marginLeft: 14, paddingLeft: 14, borderLeft: '1px solid var(--border)',
          }}>
            {jobs.length} Stellen · {new Date(lastSearchAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onReloadDb}
          disabled={dbLoading}
          title="Neue Crawler-Ergebnisse laden (auto: 60s)"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: dbLoading ? 'var(--accent-soft)' : 'var(--bg)',
            color: dbLoading ? 'var(--accent)' : 'var(--txt2)',
            fontSize: 12, boxShadow: 'var(--shadow-sm)',
          }}
        >
          <RefreshCw size={14} style={{ animation: dbLoading ? 'spin 1s linear infinite' : 'none' }} />
          {dbLoading ? 'Lade…' : 'DB'}
        </button>
        <button
          onClick={onSettings}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--txt2)',
            fontSize: 13, fontWeight: 600, boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Settings size={14} />
          <span>Einstellungen</span>
        </button>
        <button
          onClick={onExport}
          disabled={jobs.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg)', color: jobs.length ? 'var(--txt2)' : 'var(--txt3)',
            fontSize: 13, fontWeight: 600,
            boxShadow: 'var(--shadow-sm)', opacity: jobs.length ? 1 : 0.5,
          }}
        >
          <Download size={14} /> CSV
        </button>
        <button
          onClick={onSearch}
          disabled={isRunning}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: isRunning ? 'var(--bg3)' : 'var(--accent)',
            color: isRunning ? 'var(--txt3)' : '#fff',
            fontSize: 13.5, fontWeight: 600, letterSpacing: '0.2px',
            boxShadow: isRunning ? 'none' : '0 4px 12px -3px rgba(79,70,229,.5)',
            opacity: isRunning ? 0.75 : 1,
          }}
        >
          <Search size={15} strokeWidth={2.5} />
          {isRunning ? 'Läuft…' : 'Suche starten'}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </header>
  )
}
