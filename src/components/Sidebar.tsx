import { Search, Star, BarChart3, Plug, Settings, Grid3X3, Palette, Armchair, Building, Briefcase, LayoutGrid, MoreHorizontal, Building2, Bell, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { useCrawlStatus } from '../hooks/useCrawlStatus'
import type { FilterCategory, SortOption } from '../types'

const CATEGORIES: { id: FilterCategory; label: string; icon: React.ReactNode; activeColor: string }[] = [
  { id: 'all',         label: 'Alle',         icon: <LayoutGrid size={14} />,     activeColor: 'var(--accent)' },
  { id: 'design',      label: 'Design',       icon: <Palette size={14} />,        activeColor: 'var(--blue-txt)' },
  { id: 'interior',    label: 'Interior',     icon: <Armchair size={14} />,       activeColor: 'var(--teal-txt)' },
  { id: 'architektur', label: 'Architektur',  icon: <Building size={14} />,       activeColor: 'var(--green-txt)' },
  { id: 'management',  label: 'Management',   icon: <Briefcase size={14} />,      activeColor: 'var(--amber-txt)' },
  { id: 'direkt',      label: 'Direktfunde',  icon: <Grid3X3 size={14} />,        activeColor: 'var(--amber-txt)' },
  { id: 'sonstiges',   label: 'Sonstige',     icon: <MoreHorizontal size={14} />, activeColor: 'var(--txt2)' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date',      label: 'Neueste zuerst' },
  { value: 'score',     label: '⭐ Score (Intelligence)' },
  { value: 'title',     label: 'Titel A–Z' },
  { value: 'company',   label: 'Firma A–Z' },
  { value: 'source',    label: 'Nach Quelle' },
  { value: 'favorites', label: 'Favoriten oben' },
]

const NAV_ITEMS = [
  { id: 'results',   label: 'Alle Stellen',  icon: <LayoutGrid size={14} />, group: 'search' },
  { id: 'favs',      label: 'Favoriten',     icon: <Star size={14} />,       group: 'search' },
  { id: 'log',       label: 'Quellen-Log',   icon: <BarChart3 size={14} />,  group: 'tools' },
  { id: 'sources',   label: 'Quellen',       icon: <Plug size={14} />,       group: 'tools' },
  { id: 'settings',  label: 'Einstellungen', icon: <Settings size={14} />,   group: 'tools' },
  { id: 'companies', label: 'Unternehmen',   icon: <Building2 size={14} />,  group: 'tools' },
  { id: 'feed',      label: 'Intelligence',  icon: <Bell size={14} />,       group: 'tools' },
]

const GROUP_LABELS: Record<string, string> = {
  search: 'Stellengesuche',
  tools: 'Tools',
}

const CRAWLER_LABELS: Record<string, string> = {
  ba:           'BA + Berufsgruppen',
  portals:      'Portale (Jina + Gemini)',
  firmenseiten: 'Firmenseiten',
  linkedin:     'LinkedIn',
  discover:     'Firmen-Discovery',
  cleanup:      'Cleanup (>30 Tage)',
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'gerade eben'
  if (m < 60) return `vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std.`
  return `vor ${Math.floor(h / 24)} Tagen`
}

interface Props {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function Sidebar({ activeTab, onTabChange }: Props) {
  const {
    jobs, favorites, filterQ, sortBy, filterCategory, favoritesOnly,
    setFilterQ, setSortBy, setFilterCategory, setFavoritesOnly,
    getCategoryCounts, searchPhase,
  } = useStore()

  const { status: crawlStatus, isLive, lastFinished, refresh: refreshStats } = useCrawlStatus()

  const counts = getCategoryCounts()
  const hasJobs = jobs.length > 0

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
      {text}
    </div>
  )

  const renderNavGroup = (group: string) => {
    const groupItems = NAV_ITEMS.filter(i => i.group === group)
    if (!groupItems.length) return null
    return (
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        {sectionLabel(GROUP_LABELS[group] ?? group)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groupItems.map(item => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
                  color: isActive ? 'var(--accent-txt)' : 'var(--txt2)',
                  width: '100%', textAlign: 'left', transition: 'all .15s',
                }}
              >
                <span style={{ color: isActive ? 'var(--accent)' : 'var(--txt3)' }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 64px)',
      position: 'sticky', top: 64,
      overflowY: 'auto', overflowX: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>

      {/* ── Live Crawler Status ─────────────────────────────── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          {sectionLabel('Crawler Status')}
          <button
            onClick={refreshStats}
            title="Aktualisieren"
            style={{ color: 'var(--txt3)', padding: 2, marginTop: -6 }}
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Gesamtanzahl aus Supabase */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
          borderRadius: 'var(--radius)', padding: '8px 10px', marginBottom: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
            Gesamt in DB
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
            {crawlStatus?.total ?? '…'}
          </span>
        </div>

        {/* Crawler-Runs */}
        {crawlStatus && Object.entries(crawlStatus.last_crawls).map(([source, run]) => (
          <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: run.status === 'running' ? '#22c55e'
                : run.status === 'error' ? '#ef4444' : 'var(--txt3)',
              boxShadow: run.status === 'running' ? '0 0 5px #22c55e' : 'none',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: 'var(--txt2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {CRAWLER_LABELS[source] ?? source}
              </div>
              <div style={{ fontSize: 10, color: 'var(--txt3)' }}>
                {run.status === 'running' ? 'läuft…' : relativeTime(run.finished_at)}
                {run.status === 'done' && run.job_count > 0 && ` · ${run.job_count} Jobs`}
              </div>
            </div>
          </div>
        ))}

        {!crawlStatus && (
          <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Lade Status…</div>
        )}

        {/* Letzter Crawl gesamt */}
        {lastFinished && (
          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
            Zuletzt: {relativeTime(lastFinished)}
          </div>
        )}
      </div>

      {/* ── Stellengesuche (direkt unter Gesamt in DB) ─── */}
      {renderNavGroup('search')}

      {/* ── Kategorien ──────────────────────────────────────── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        {sectionLabel('Kategorie')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CATEGORIES.map(cat => {
            const isActive = filterCategory === cat.id
            const count = counts[cat.id] || 0
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
                  color: isActive ? cat.activeColor : 'var(--txt2)',
                  width: '100%', textAlign: 'left', transition: 'all .15s',
                }}
              >
                <span style={{ color: isActive ? cat.activeColor : 'var(--txt3)' }}>{cat.icon}</span>
                <span style={{ flex: 1 }}>{cat.label}</span>
                {hasJobs && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: isActive ? 'var(--accent-soft)' : 'var(--bg3)',
                    color: isActive ? 'var(--accent)' : 'var(--txt3)',
                    padding: '1px 7px', borderRadius: 99, minWidth: 22, textAlign: 'center',
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {hasJobs && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          {sectionLabel('Suchsession')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Geladen',    value: jobs.length,                               color: 'var(--accent)' },
              { label: 'Direktfunde',value: counts.direkt || 0,                        color: 'var(--teal-txt)' },
              { label: 'Favoriten',  value: favorites.size,                            color: 'var(--green-txt)' },
              { label: 'Quellen',    value: new Set(jobs.map(j => j.quelle)).size,     color: 'var(--txt)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '8px 10px',
                boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2, letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.5px' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        {sectionLabel('Filter')}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Titel, Firma, Ort…"
            value={filterQ}
            onChange={e => setFilterQ(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13, background: 'var(--bg2)', borderColor: 'transparent' }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          style={{ fontSize: 12.5, cursor: 'pointer', marginBottom: 8 }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          style={{
            width: '100%', padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${favoritesOnly ? 'var(--amber-border)' : 'var(--border)'}`,
            fontSize: 12.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            background: favoritesOnly ? 'var(--amber-bg)' : 'var(--bg)',
            color: favoritesOnly ? 'var(--amber-txt)' : 'var(--txt2)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Star size={13} fill={favoritesOnly ? 'currentColor' : 'none'} />
          Nur Favoriten
        </button>
      </div>


      {/* ── Tools ───────────────────────────────────────────── */}
      {renderNavGroup('tools')}

      {/* ── Crawler läuft / Suchphase ───────────────────────── */}
      {(isLive || (searchPhase !== 'idle' && searchPhase !== 'done' && searchPhase !== 'error')) && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--accent)', fontWeight: 500,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              animation: 'pulse 1.2s infinite',
            }} />
            {isLive && 'Crawler aktiv…'}
            {!isLive && searchPhase === 'fast'    && 'BA-API läuft…'}
            {!isLive && searchPhase === 'portals' && 'Portale werden durchsucht…'}
            {!isLive && searchPhase === 'firmen'  && 'Firmenseiten direkt…'}
            {!isLive && searchPhase === 'linkedin' && 'LinkedIn…'}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </aside>
  )
}
