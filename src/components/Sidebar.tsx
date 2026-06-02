import { Search, Star, BarChart3, Plug, Settings, Grid3X3, Palette, Armchair, Building, Briefcase, LayoutGrid, MoreHorizontal, Building2, Bell } from 'lucide-react'
import { useStore } from '../store'
import type { FilterCategory, SortOption } from '../types'

const CATEGORIES: { id: FilterCategory; label: string; icon: React.ReactNode; colorVar: string }[] = [
  { id: 'all',         label: 'Alle',         icon: <LayoutGrid size={14} />,  colorVar: 'var(--paper)' },
  { id: 'design',      label: 'Design',       icon: <Palette size={14} />,     colorVar: 'var(--cat-design)' },
  { id: 'interior',    label: 'Interior',     icon: <Armchair size={14} />,    colorVar: 'var(--cat-interior)' },
  { id: 'architektur', label: 'Architektur',  icon: <Building size={14} />,    colorVar: 'var(--cat-arch)' },
  { id: 'management',  label: 'Management',   icon: <Briefcase size={14} />,   colorVar: 'var(--cat-mgmt)' },
  { id: 'direkt',      label: 'Direktfunde',  icon: <Grid3X3 size={14} />,     colorVar: 'var(--gold)' },
  { id: 'sonstiges',   label: 'Sonstige',     icon: <MoreHorizontal size={14}/>, colorVar: 'var(--fog-2)' },
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
  { id: 'results',   label: 'Alle Stellen',   icon: <LayoutGrid size={14} />,  group: 'search' },
  { id: 'favs',      label: 'Favoriten',      icon: <Star size={14} />,        group: 'search' },
  { id: 'companies', label: 'Unternehmen',    icon: <Building2 size={14} />,   group: 'intel' },
  { id: 'feed',      label: 'Intelligence',   icon: <Bell size={14} />,        group: 'intel' },
  { id: 'log',       label: 'Quellen-Log',    icon: <BarChart3 size={14} />,   group: 'tools' },
  { id: 'sources',   label: 'Quellen',        icon: <Plug size={14} />,        group: 'tools' },
  { id: 'settings',  label: 'Einstellungen',  icon: <Settings size={14} />,    group: 'tools' },
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

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--ink-2)',
      borderRight: '1px solid var(--ink-4)',
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)',
      position: 'sticky', top: 52,
      overflowY: 'auto', overflowX: 'hidden',
    }}>

      {/* Stats */}
      {hasJobs && (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--ink-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Gefunden', value: jobs.length, color: 'var(--gold)' },
              { label: 'Quellen', value: new Set(jobs.map(j => j.quelle)).size, color: 'var(--paper)' },
              { label: 'Favoriten', value: favorites.size, color: 'var(--gold)' },
              { label: 'Direktfunde', value: counts.direkt || 0, color: 'var(--cat-interior)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--ink-3)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--fog)', marginBottom: 3, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--ink-4)' }}>
        <div style={{ fontSize: 10, color: 'var(--fog)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>Filter</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fog)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Titel, Firma, Ort…"
            value={filterQ}
            onChange={e => setFilterQ(e.target.value)}
            style={{ paddingLeft: 30, fontSize: 12 }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          style={{ fontSize: 12, cursor: 'pointer' }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          style={{
            marginTop: 8, width: '100%', padding: '6px 10px',
            borderRadius: 'var(--r)', fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
            background: favoritesOnly ? 'var(--gold-dim)' : 'var(--ink-4)',
            color: favoritesOnly ? 'var(--gold)' : 'var(--fog-2)',
          }}
        >
          <Star size={13} fill={favoritesOnly ? 'currentColor' : 'none'} />
          Nur Favoriten
        </button>
      </div>

      {/* Categories */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--ink-4)' }}>
        <div style={{ fontSize: 10, color: 'var(--fog)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>Kategorie</div>
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
                  padding: '7px 10px', borderRadius: 'var(--r)',
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--ink-4)' : 'transparent',
                  color: isActive ? cat.colorVar : 'var(--fog-2)',
                  width: '100%', textAlign: 'left',
                }}
              >
                <span style={{ color: isActive ? cat.colorVar : 'var(--fog)' }}>{cat.icon}</span>
                <span style={{ flex: 1 }}>{cat.label}</span>
                {hasJobs && <span style={{ fontSize: 11, color: 'var(--fog)', background: 'var(--ink-5)', padding: '1px 6px', borderRadius: 99 }}>{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ padding: '12px 14px', flex: 1 }}>
        {(['search','intel','tools'] as const).map(group => {
          const groupItems = NAV_ITEMS.filter(i => i.group === group)
          const groupLabel = group === 'search' ? 'Suche' : group === 'intel' ? '🤖 Intelligence' : 'Tools'
          return (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--fog)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>{groupLabel}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {groupItems.map(item => {
                  const isActive = activeTab === item.id
                  const isIntel = item.group === 'intel'
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 'var(--r)',
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        background: isActive ? (isIntel ? 'rgba(59,130,246,0.15)' : 'var(--gold-dim)') : 'transparent',
                        color: isActive ? (isIntel ? '#60a5fa' : 'var(--gold)') : 'var(--fog-2)',
                        width: '100%', textAlign: 'left',
                      }}
                    >
                      {item.icon}
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
      {searchPhase !== 'idle' && searchPhase !== 'done' && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--ink-4)', fontSize: 11, color: 'var(--gold)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)',
              animation: 'pulse 1.2s infinite',
            }} />
            {searchPhase === 'fast' && 'BA-API läuft…'}
            {searchPhase === 'portals' && 'Portale werden durchsucht…'}
            {searchPhase === 'firmen' && 'Firmenseiten direkt…'}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </aside>
  )
}
