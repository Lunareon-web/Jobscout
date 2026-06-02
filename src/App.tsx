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
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'}))
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
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column'}}>
      <Topbar onSearch={handleSearch} onSettings={()=>setActiveTab('settings')} onExport={handleExport} />
      <div style={{display:'flex',flex:1}}>
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main style={{flex:1,padding:'20px 24px',minWidth:0,overflowY:'auto',maxHeight:'calc(100vh - 52px)'}}>

          {isRunning && (
            <div style={{marginBottom:20}}>
              <div style={{height:3,background:'var(--ink-4)',borderRadius:99,overflow:'hidden'}}>
                <div style={{height:'100%',background:'var(--gold)',borderRadius:99,
                  width: searchPhase==='fast'?'25%':searchPhase==='portals'?'60%':'85%',
                  transition:'width 600ms var(--ease)'}} />
              </div>
              <p style={{fontSize:11,color:'var(--fog)',marginTop:6}}>
                {searchPhase==='fast' && '1/3 — Bundesagentur für Arbeit (parallel)…'}
                {searchPhase==='portals' && '2/3 — Portale: Kimeta, StepStone, RSS-Feeds…'}
                {searchPhase==='firmen' && '3/3 — 20 Firmenseiten direkt…'}
              </p>
            </div>
          )}

          {(activeTab==='results'||activeTab==='favs') && (
            <>
              {jobs.length===0 && !isRunning && (
                <div style={{textAlign:'center',padding:'80px 20px'}}>
                  <div style={{width:64,height:64,borderRadius:'50%',background:'var(--gold-dim)',border:'1px solid rgba(201,168,76,0.2)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:28}}>🔍</div>
                  <h2 style={{fontSize:20,fontWeight:700,marginBottom:10,color:'var(--paper)'}}>Bereit zur Suche</h2>
                  <p style={{fontSize:14,color:'var(--fog)',maxWidth:380,margin:'0 auto 24px',lineHeight:1.7}}>
                    Durchsucht <strong style={{color:'var(--paper)'}}>BA-API + RSS-Feeds + 20 Firmenseiten</strong> parallel in 3 Stufen.
                  </p>
                  <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                    <button onClick={handleSearch} style={{padding:'12px 28px',borderRadius:'var(--r)',background:'var(--gold)',color:'var(--ink)',fontSize:14,fontWeight:700}}>
                      Suche starten
                    </button>
                    <button onClick={loadFromSupabase} disabled={supabaseLoading} style={{padding:'12px 28px',borderRadius:'var(--r)',background:'var(--ink-4)',color:'var(--paper)',fontSize:14,fontWeight:600,opacity:supabaseLoading?0.6:1}}>
                      {supabaseLoading ? 'Lade…' : '🗄 Aus Datenbank laden'}
                    </button>
                  </div>
                </div>
              )}

              {jobs.length>0 && allFiltered.length===0 && (
                <div style={{textAlign:'center',padding:'60px 20px',color:'var(--fog)'}}>
                  <p style={{fontSize:14}}>Keine Treffer für die aktuellen Filter.</p>
                </div>
              )}

              {pageJobs.length>0 && (
                <>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{fontSize:12,color:'var(--fog)'}}>{allFiltered.length} Stellen</div>
                    {totalPages>1 && <div style={{fontSize:12,color:'var(--fog)'}}>Seite {page} / {totalPages}</div>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {pageJobs.map(job => <JobCard key={job.id} job={job} />)}
                  </div>
                  {totalPages>1 && (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'24px 0'}}>
                      <button onClick={()=>{setCurrentPage(page-1);window.scrollTo(0,0)}} disabled={page<=1}
                        style={{padding:'8px 16px',borderRadius:'var(--r)',background:'var(--ink-4)',color:page>1?'var(--paper)':'var(--fog)',fontSize:12,fontWeight:500,opacity:page<=1?0.4:1}}>
                        ← Zurück
                      </button>
                      <span style={{fontSize:12,color:'var(--fog)'}}>{page} / {totalPages}</span>
                      <button onClick={()=>{setCurrentPage(page+1);window.scrollTo(0,0)}} disabled={page>=totalPages}
                        style={{padding:'8px 16px',borderRadius:'var(--r)',background:'var(--ink-4)',color:page<totalPages?'var(--paper)':'var(--fog)',fontSize:12,fontWeight:500,opacity:page>=totalPages?0.4:1}}>
                        Weiter →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab==='log' && <LogPanel />}
          {activeTab==='sources' && <SourcesPanel />}
          {activeTab==='settings' && (
            <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'flex-start'}}>
              <SettingsPanel />
              <ServerControl />
            </div>
          )}
          {activeTab==='companies' && (
            <div style={{height:'calc(100vh - 92px)',overflow:'hidden',margin:'-20px -24px'}}>
              <CompanyDashboard />
            </div>
          )}
          {activeTab==='feed' && (
            <div style={{height:'calc(100vh - 92px)',overflow:'hidden',margin:'-20px -24px'}}>
              <IntelligenceFeed />
            </div>
          )}
        </main>
      </div>
      <Toaster position="bottom-right" toastOptions={{
        style:{background:'var(--ink-3)',color:'var(--paper)',border:'1px solid var(--ink-5)',fontFamily:'var(--font)',fontSize:13},
        success:{iconTheme:{primary:'var(--gold)',secondary:'var(--ink)'}},
      }}/>
    </div>
  )
}
