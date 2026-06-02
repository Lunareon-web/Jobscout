import { Search, Download, Settings, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { useSupabaseJobs } from '../hooks/useSupabaseJobs'
import type { SearchPhase } from '../types'

const PHASE_LABELS: Record<SearchPhase, string> = {
  idle:    '',
  fast:    'Stufe 1/3 — Bundesagentur…',
  portals: 'Stufe 2/3 — Portale + RSS…',
  firmen:  'Stufe 3/3 — Firmenseiten…',
  done:    '',
  error:   'Fehler',
}

interface Props {
  onSearch: () => void
  onSettings: () => void
  onExport: () => void
}

export function Topbar({ onSearch, onSettings, onExport }: Props) {
  const { searchPhase, jobs, lastSearchAt } = useStore()
  const { loadFromSupabase, loading: dbLoading } = useSupabaseJobs()
  const isRunning = searchPhase !== 'idle' && searchPhase !== 'done' && searchPhase !== 'error'
  const phaseLabel = PHASE_LABELS[searchPhase]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--ink-2)',
      borderBottom: '1px solid var(--ink-4)',
      height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Search size={14} color="var(--ink)" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--paper)' }}>Job-Scout</div>
          <div style={{ fontSize: 10, color: 'var(--fog)', letterSpacing: '0.4px' }}>DÜSSELDORF · 50 KM</div>
        </div>

        {/* Progress indicator */}
        {isRunning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--gold-dim)', borderRadius: 99,
            padding: '4px 12px', fontSize: 11, color: 'var(--gold)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'spin 1s linear infinite' }} />
            {phaseLabel}
          </div>
        )}

        {searchPhase === 'done' && lastSearchAt && (
          <div style={{ fontSize: 11, color: 'var(--fog)', marginLeft: 4 }}>
            {jobs.length} Stellen · {new Date(lastSearchAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={loadFromSupabase}
          disabled={dbLoading}
          title="Neue Crawler-Ergebnisse laden"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px', borderRadius: 'var(--r)',
            background: 'var(--ink-4)', color: 'var(--fog-2)',
            fontSize: 12, opacity: dbLoading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: dbLoading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button
          onClick={onSettings}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px', borderRadius: 'var(--r)',
            background: 'var(--ink-4)', color: 'var(--fog-2)',
            fontSize: 12,
          }}
        >
          <Settings size={14} />
        </button>
        <button
          onClick={onExport}
          disabled={jobs.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 'var(--r)',
            background: 'var(--ink-4)', color: jobs.length ? 'var(--fog-2)' : 'var(--fog)',
            fontSize: 12, fontWeight: 500, opacity: jobs.length ? 1 : 0.5,
          }}
        >
          <Download size={14} /> CSV
        </button>
        <button
          onClick={onSearch}
          disabled={isRunning}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: 'var(--r)',
            background: isRunning ? 'var(--ink-4)' : 'var(--gold)',
            color: isRunning ? 'var(--fog)' : 'var(--ink)',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.2px',
            opacity: isRunning ? 0.7 : 1,
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
