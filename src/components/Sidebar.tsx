import { Search, Star, BarChart3, Plug, Settings, Grid3X3, Palette, Armchair, Building, Briefcase, LayoutGrid, MoreHorizontal, Building2, Bell } from 'lucide-react'
import { useStore } from '../store'
import type { FilterCategory, SortOption } from '../types'

const CATEGORIES: { id: FilterCategory; label: string; icon: React.ReactNode; activeColor: string }[] = [
  { id: 'all',         label: 'Alle',         icon: <LayoutGrid size={14} />,    activeColor: 'var(--accent)' },
  { id: 'design',      label: 'Design',       icon: <Palette size={14} />,       activeColor: 'var(--blue-txt)' },
  { id: 'interior',    label: 'Interior',     icon: <Armchair size={14} />,      activeColor: 'var(--teal-txt)' },
  { id: 'architektur', label: 'Architektur',  icon: <Building size={14} />,      activeColor: 'var(--green-txt)' },
  { id: 'management',  label: 'Management',   icon: <Briefcase size={14} />,     activeColor: 'var(--amber-txt)' },
  { id: 'direkt',      label: 'Direktfunde',  icon: <Grid3X3 size={14} />,       activeColor: 'var(--amber-txt)' },
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
  { id: 'companies', label: 'Unternehmen',   icon: <Building2 size={14} />,  group: 'intel' },
  { id: 'feed',      label: 'Intelligence',  icon: <Bell size={14} />,       group: 'intel' },
  { id: 'log',       label: 'Quellen-Log',   icon: <BarChart3 size={14} />,  group: 'tools' },
  { id: 'sources',   label: 'Quellen',       icon: <Plug size={14} />,       group: 'tools' },
  { id: 'settings',  label: 'Einstellungen', icon: <Settings size={14} />,   group: 'tools' },
]

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

  const counts = getCategoryCounts()
  const hasJobs = jobs.length > 0

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
      {text}
    </div>
  )

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

      {/* Stats */}
      {hasJobs && (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Gefunden',   value: jobs.length,                                      color: 'var(--accent)' },
              { label: 'Quellen',    value: new Set(jobs.map(j => j.quelle)).size,            color: 'var(--txt)' },
              { label: 'Favoriten',  value: favorites.size,                                   color: 'var(--green-txt)' },
              { label: 'Direktfunde',value: counts.direkt || 0,                               color: 'var(--teal-txt)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '10px 12px',
                boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 4, letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-1px' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
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

      {/* Categories */}
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
                  width: '100%', textAlign: 'left',
                  transition: 'all .15s',
                }}
              >
                <span style={{ color: isActive ? cat.activeColor : 'var(--txt3)' }}>{cat.icon}</span>
                <span style={{ flex: 1 }}>{cat.label}</span>
                {hasJobs && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: isActive ? 'var(--accent-soft)' : 'var(--bg3)',
                    color: isActive ? 'var(--accent)' : 'var(--txt3)',
                    padding: '1px 7px', borderRadius: 99,
                    minWidth: 22, textAlign: 'center',
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ padding: '12px 14px', flex: 1 }}>
        {(['search', 'intel', 'tools'] as const).map(group => {
          const groupItems = NAV_ITEMS.filter(i => i.group === group)
          const groupLabel = group === 'search' ? 'Suche' : group === 'intel' ? 'Intelligence' : 'Tools'
          return (
            <div key={group} style={{ marginBottom: 14 }}>
              {sectionLabel(groupLabel)}
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
                        width: '100%', textAlign: 'left',
                        transition: 'all .15s',
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
        })}
      </div>

      {/* Phase indicator */}
      {searchPhase !== 'idle' && searchPhase !== 'done' && searchPhase !== 'error' && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--accent)', fontWeight: 500,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              animation: 'pulse 1.2s infinite',
            }} />
            {searchPhase === 'fast'    && 'BA-API läuft…'}
            {searchPhase === 'portals' && 'Portale werden durchsucht…'}
            {searchPhase === 'firmen'  && 'Firmenseiten direkt…'}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </aside>
  )
}
