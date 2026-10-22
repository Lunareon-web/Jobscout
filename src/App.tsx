import { useState, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { Topbar } from './components/Topbar'
import { Sidebar } from './components/Sidebar'
import { JobCard } from './components/JobCard'
import { SourcesPanel } from './components/SourcesPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { LogPanel } from './components/LogPanel'
import CompanyDashboard from './components/CompanyDashboard'
import IntelligenceFeed from './components/IntelligenceFeed'
import ServerControl from './components/ServerControl'
import { useSearch } from './hooks/useSearch'
import { useSupabaseJobs } from './hooks/useSupabaseJobs'
import { useStore } from './store'
import { formatDate } from './lib/utils'
import { isSupabaseConfigured } from './lib/supabase'
import './App.css'

const PER_PAGE = 25

export default function App() {
  const [activeTab, setActiveTab] = useState('results')
  const { startSearch } = useSearch()
  const { loadFromSupabase, loading: supabaseLoading } = useSupabaseJobs()
  const { jobs, favorites, notes, searchPhase, currentPage, setCurrentPage, getFilteredJobs } = useStore()

  const handleSearch = useCallback(async () => {
    setActiveTab('results')
    await startSearch()
  }, [startSearch])

  const handleExport = useCallback(() => {
    const filtered = getFilteredJobs()
    if (!filtered.length) { toast.error('Keine Daten zum Exportieren'); return }
    const headers = ['Jobtitel','Unternehmen','Ort','PLZ','Datum','Kategorie','Quelle','Favorit','Notiz','URL']
    const rows = filtered.map(j => [
      j.titel, j.unternehmen, j.ort, j.plz||'',
      j.datum ? formatDate(j.datum) : '',
      j.kategorie, j.quelle,
      favorites.has(j.id) ? 'Ja' : 'Nein',
      notes[j.id]||'', j.url,
    ])
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'}))
    a.download = `jobscout_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    toast.success(`${filtered.length} Stellen exportiert`)
  }, [getFilteredJobs, favorites, notes])

  const allFiltered = getFilteredJobs().filter(j => activeTab === 'favs' ? favorites.has(j.id) : true)
  const totalPages = Math.max(1, Math.ceil(allFiltered.length / PER_PAGE))
  const page = Math.min(currentPage, totalPages)
  const pageJobs = allFiltered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const isRunning = searchPhase !== 'idle' && searchPhase !== 'done' && searchPhase !== 'error'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page)' }}>
      <Topbar onSearch={handleSearch} onSettings={() => setActiveTab('settings')} onExport={handleExport} onReloadDb={loadFromSupabase} dbLoading={supabaseLoading} />
      {!isSupabaseConfigured && (
        <div style={{
          background: '#fde8e8', color: '#991b1b', borderBottom: '1px solid #f3b8b8',
          padding: '10px 24px', fontSize: 13, fontWeight: 600, lineHeight: 1.5,
        }}>
          ⚠️ Datenbank nicht verbunden — <span style={{ fontWeight: 500 }}>VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen in den Vercel Environment Variables.</span>
          {' '}Manuelle Suche funktioniert trotzdem, Ergebnisse werden nur nicht gespeichert.
        </div>
      )}
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main style={{
          flex: 1, padding: '24px 28px', minWidth: 0,
          overflowY: 'auto', maxHeight: 'calc(100vh - 64px)',
        }}>
          <div style={{ maxWidth: 820 }}>

            {/* Progress bar */}
            {isRunning && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent), #7c74f2)',
                    borderRadius: 99,
                    width: searchPhase === 'fast' ? '18%' : searchPhase === 'portals' ? '38%' : searchPhase === 'firmen' ? '58%' : searchPhase === 'linkedin' ? '78%' : '95%',
                    transition: 'width 600ms ease',
                  }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 6, fontWeight: 500 }}>
                  {searchPhase === 'fast'    && '1/5 — Bundesagentur für Arbeit (parallel)…'}
                  {searchPhase === 'portals' && '2/5 — Portale (Jina + Gemini)…'}
                  {searchPhase === 'firmen'  && '3/5 — Firmenseiten direkt…'}
                  {searchPhase === 'linkedin' && '4/5 — LinkedIn…'}
                  {searchPhase === 'jooble'  && '5/5 — Jooble…'}
                </p>
              </div>
            )}

            {(activeTab === 'results' || activeTab === 'favs') && (
              <>
                {/* Empty start state */}
                {jobs.length === 0 && !isRunning && (
                  <div style={{ textAlign: 'center', padding: '72px 20px' }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: 20,
                      background: 'var(--accent-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 20px',
                    }}>
                      <span style={{ fontSize: 34, color: 'var(--accent)' }}>🔍</span>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 9, color: 'var(--txt)', letterSpacing: '-.3px' }}>
                      Bereit zur Suche
                    </h2>
                    <p style={{ fontSize: 14, color: 'var(--txt2)', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.65 }}>
                      Durchsucht <strong style={{ color: 'var(--txt)', fontWeight: 700 }}>BA-API + Portale + Firmenseiten + LinkedIn + Jooble</strong> in 5 Stufen.
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={handleSearch}
                        style={{
                          padding: '10px 24px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent)', color: '#fff',
                          fontSize: 13.5, fontWeight: 600,
                          boxShadow: '0 4px 12px -3px rgba(79,70,229,.5)',
                          border: 'none',
                        }}
                      >
                        Suche starten
                      </button>
                      <button
                        onClick={loadFromSupabase}
                        disabled={supabaseLoading}
                        style={{
                          padding: '10px 24px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg)', color: 'var(--txt2)',
                          border: '1px solid var(--border)',
                          fontSize: 13.5, fontWeight: 600,
                          opacity: supabaseLoading ? 0.6 : 1,
                          boxShadow: 'var(--shadow-sm)',
                        }}
                      >
                        {supabaseLoading ? 'Lade…' : '🗄 Aus Datenbank laden'}
                      </button>
                    </div>
                  </div>
                )}

                {/* No results for filter */}
                {jobs.length > 0 && allFiltered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: 20,
                      background: 'var(--accent-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 20px',
                    }}>
                      <span style={{ fontSize: 34 }}>😶</span>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 9, letterSpacing: '-.3px' }}>Keine Treffer</h3>
                    <p style={{ fontSize: 14, color: 'var(--txt2)' }}>Filter anpassen oder Kategorie wechseln.</p>
                  </div>
                )}

                {/* Results list */}
                {pageJobs.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 600 }}>
                        {allFiltered.length} Stellen
                      </div>
                      {totalPages > 1 && (
                        <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 600 }}>
                          Seite {page} / {totalPages}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pageJobs.map(job => <JobCard key={job.id} job={job} />)}
                    </div>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '26px 0 6px' }}>
                        <button
                          onClick={() => { setCurrentPage(page - 1); window.scrollTo(0, 0) }}
                          disabled={page <= 1}
                          style={{
                            padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg)', color: page > 1 ? 'var(--txt2)' : 'var(--txt3)',
                            fontSize: 13, fontWeight: 600,
                            boxShadow: 'var(--shadow-sm)', opacity: page <= 1 ? 0.4 : 1,
                          }}
                        >← Zurück</button>
                        <span style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 600 }}>
                          {page} / {totalPages}
                        </span>
                        <button
                          onClick={() => { setCurrentPage(page + 1); window.scrollTo(0, 0) }}
                          disabled={page >= totalPages}
                          style={{
                            padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg)', color: page < totalPages ? 'var(--txt2)' : 'var(--txt3)',
                            fontSize: 13, fontWeight: 600,
                            boxShadow: 'var(--shadow-sm)', opacity: page >= totalPages ? 0.4 : 1,
                          }}
                        >Weiter →</button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === 'log'      && <LogPanel />}
            {activeTab === 'sources'  && <SourcesPanel />}
            {activeTab === 'settings' && (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <SettingsPanel />
                <ServerControl />
              </div>
            )}
          </div>

          {activeTab === 'companies' && (
            <div style={{ height: 'calc(100vh - 88px)', overflow: 'hidden', margin: '-24px -28px' }}>
              <CompanyDashboard />
            </div>
          )}
          {activeTab === 'feed' && (
            <div style={{ height: 'calc(100vh - 88px)', overflow: 'hidden', margin: '-24px -28px' }}>
              <IntelligenceFeed />
            </div>
          )}
        </main>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--txt)',
            color: '#fff',
            fontFamily: 'var(--font)',
            fontSize: 13.5,
            fontWeight: 500,
            borderRadius: 11,
            boxShadow: 'var(--shadow-lg)',
          },
          success: { iconTheme: { primary: '#1f7a45', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#bb3636', secondary: '#fff' } },
        }}
      />
    </div>
  )
}
