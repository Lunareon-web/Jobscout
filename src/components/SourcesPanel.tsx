import { useStore } from '../store'

const SOURCES = [
  { name: 'Bundesagentur für Arbeit', note: 'REST-API — offiziell, CORS-frei, keine Auth nötig', type: 'API', color: 'var(--green)' },
  { name: 'BA Berufsgruppen', note: 'KldB-Berufsgruppen Design/Architektur/Management — erschließt nicht keywordbasierte Stellen', type: 'API', color: 'var(--green)' },
  { name: 'Kimeta RSS', note: 'Meta-Aggregator — 208KB RSS-Feed, fasst viele Jobbörsen zusammen', type: 'RSS', color: 'var(--cat-interior)' },
  { name: 'StepStone', note: 'JSON-LD aus HTML extrahiert', type: 'Scraping', color: 'var(--blue)' },
  { name: 'Karriere.de', note: 'RSS-Feed', type: 'RSS', color: 'var(--cat-interior)' },
  { name: 'Stellenanzeigen.de', note: 'RSS-Feed', type: 'RSS', color: 'var(--cat-interior)' },
  { name: 'Kalaydo (Rheinland)', note: 'JSON-LD, regional NRW/Rheinland', type: 'Scraping', color: 'var(--blue)' },
  { name: 'Firmenseiten direkt (20)', note: 'JSON-LD → __NEXT_DATA__ → Link-Scan — parallel', type: 'Direkt', color: 'var(--gold)' },
]

export function SourcesPanel() {
  const { searchLog } = useStore()

  const getCount = (name: string) => {
    const entry = searchLog.find(l => l.quelle.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    return entry?.anzahl ?? null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {SOURCES.map(s => {
        const count = getCount(s.name)
        return (
          <div
            key={s.name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 14, padding: '12px 16px',
              background: 'var(--ink-2)', border: '1px solid var(--ink-4)',
              borderRadius: 'var(--r)',
              marginBottom: 4,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--paper)', marginBottom: 2 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fog)' }}>{s.note}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {count !== null && (
                <span style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? s.color : 'var(--fog)' }}>
                  {count}
                </span>
              )}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, letterSpacing: '0.4px',
                background: `${s.color}18`, color: s.color,
              }}>{s.type}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
