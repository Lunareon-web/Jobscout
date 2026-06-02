import { useEffect, useState } from 'react'
import { Building2, Briefcase, ExternalLink, RefreshCw, TrendingUp, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────
interface Company {
  id: string
  name: string
  website: string
  city: string
  industry: string | null
  employee_range: string | null
  services: string[]
  score: number
  priority: string
}

interface Job { id: string; titel: string; ort: string; url: string; score: number }
interface Contact { id: string; name: string; title: string | null }
interface Project { id: string; project_type: string; title: string; location: string | null }

// ── Styling helpers ───────────────────────────────────────────
const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  'A+': { bg: '#e7f5ec', color: '#1f7a45' },
  'A':  { bg: '#e7f5ec', color: '#1f7a45' },
  'B':  { bg: '#eef0fe', color: '#4338ca' },
  'C':  { bg: '#fdf0db', color: '#9a6212' },
  'D':  { bg: '#eef0f3', color: '#5a606b' },
}

const INDUSTRY_LABEL: Record<string, string> = {
  retail: '🛍 Retail', interior: '🪑 Interior', ladenbau: '🏪 Ladenbau',
  workplace: '🏢 Workplace', architektur: '🏛 Architektur', messebau: '🎪 Messebau', other: '📦 Sonstige',
}

type SortKey = 'name' | 'score' | 'priority' | 'city' | 'industry'

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Main Component ────────────────────────────────────────────
export default function CompanyDashboard() {
  const [companies, setCompanies]   = useState<Company[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<string | null>(null)
  const [detail, setDetail]         = useState<{ jobs: Job[]; contacts: Contact[]; projects: Project[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filterPriority, setFilterPriority] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
  const [filterQ, setFilterQ]       = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('score')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('id,name,website,city,industry,employee_range,services,score,priority')
      .order('score', { ascending: false })
      .limit(200)
    setCompanies(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openDetail = async (id: string) => {
    setSelected(id)
    setDetailLoading(true)
    const [jobsRes, contactsRes, projectsRes] = await Promise.all([
      supabase.from('jobs').select('id,titel,ort,url,score').eq('company_id', id).eq('is_active', true).order('score', { ascending: false }),
      supabase.from('contacts').select('id,name,title').eq('company_id', id),
      supabase.from('projects').select('id,project_type,title,location').eq('company_id', id),
    ])
    setDetail({
      jobs: jobsRes.data || [],
      contacts: contactsRes.data || [],
      projects: projectsRes.data || [],
    })
    setDetailLoading(false)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // Filter + sort
  const filtered = companies
    .filter(c => {
      if (filterPriority && c.priority !== filterPriority) return false
      if (filterIndustry && c.industry !== filterIndustry) return false
      if (filterQ && !`${c.name} ${c.city}`.toLowerCase().includes(filterQ.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let va: any = a[sortKey], vb: any = b[sortKey]
      if (sortKey === 'score') { va = a.score; vb = b.score }
      if (sortKey === 'priority') {
        const order: Record<string, number> = { 'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 }
        va = order[a.priority] || 0; vb = order[b.priority] || 0
      }
      if (typeof va === 'string') va = va?.toLowerCase()
      if (typeof vb === 'string') vb = vb?.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const selectedCompany = companies.find(c => c.id === selected)

  const SortIcon = ({ col }: { col: SortKey }) => (
    sortKey === col
      ? (sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)
      : <ChevronDown size={13} style={{ opacity: 0.3 }} />
  )

  const thStyle = (col: SortKey): React.CSSProperties => ({
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: sortKey === col ? 'var(--accent-soft)' : 'var(--bg2)',
    borderBottom: '1px solid var(--border)',
  })

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: 'var(--page)' }}>

      {/* ── Left: Table ── */}
      <div style={{ flex: selected ? '0 0 55%' : '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid var(--border)' : 'none' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Suche…"
            value={filterQ}
            onChange={e => setFilterQ(e.target.value)}
            style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '7px 11px', background: 'var(--bg2)', border: '1px solid transparent', borderRadius: 'var(--radius-sm)' }}
          />
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ fontSize: 12.5, padding: '7px 28px 7px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: '1px solid transparent', color: 'var(--txt2)' }}>
            <option value="">Alle Prioritäten</option>
            {['A+','A','B','C','D'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)}
            style={{ fontSize: 12.5, padding: '7px 28px 7px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: '1px solid transparent', color: 'var(--txt2)' }}>
            <option value="">Alle Branchen</option>
            {Object.entries(INDUSTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--txt2)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{filtered.length} Unternehmen</span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle('name')} onClick={() => toggleSort('name')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Unternehmen <SortIcon col="name" /></span>
                </th>
                <th style={thStyle('city')} onClick={() => toggleSort('city')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Stadt <SortIcon col="city" /></span>
                </th>
                <th style={thStyle('industry')} onClick={() => toggleSort('industry')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Branche <SortIcon col="industry" /></span>
                </th>
                <th style={thStyle('priority')} onClick={() => toggleSort('priority')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Prio <SortIcon col="priority" /></span>
                </th>
                <th style={thStyle('score')} onClick={() => toggleSort('score')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Score <SortIcon col="score" /></span>
                </th>
                <th style={{ ...thStyle('name'), cursor: 'default' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--txt3)' }}>Lade…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--txt3)' }}>Keine Einträge</td></tr>
              ) : filtered.map(c => {
                const isSelected = c.id === selected
                const ps = PRIORITY_STYLE[c.priority] || PRIORITY_STYLE['D']
                return (
                  <tr key={c.id} onClick={() => openDetail(c.id)}
                    style={{ cursor: 'pointer', background: isSelected ? 'var(--accent-soft)' : 'var(--bg)', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--accent-soft)' : 'var(--bg)' }}
                  >
                    <td style={{ padding: '11px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg,var(--bg2),var(--bg3))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--txt2)', flexShrink: 0 }}>
                          {initials(c.name)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 12px', color: 'var(--txt2)' }}>{c.city}</td>
                    <td style={{ padding: '11px 12px', color: 'var(--txt2)' }}>{INDUSTRY_LABEL[c.industry || ''] || c.industry || '—'}</td>
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{ background: ps.bg, color: ps.color, fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 99 }}>{c.priority}</span>
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--bg3)', maxWidth: 60 }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${c.score}%`, background: c.score >= 80 ? 'var(--green-txt)' : c.score >= 60 ? 'var(--accent)' : 'var(--txt3)' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', minWidth: 24 }}>{c.score}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--txt3)', display: 'flex', alignItems: 'center' }}>
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right: Detail Panel ── */}
      {selected && (
        <div style={{ flex: '0 0 45%', overflowY: 'auto', background: 'var(--page)', padding: '20px 24px' }}>
          {detailLoading ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--txt3)' }}>Lade…</div>
          ) : selectedCompany && detail ? (
            <CompanyDetail company={selectedCompany} detail={detail} onClose={() => setSelected(null)} />
          ) : null}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────
function CompanyDetail({ company, detail, onClose }: { company: Company; detail: any; onClose: () => void }) {
  const ps = PRIORITY_STYLE[company.priority] || PRIORITY_STYLE['D']

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(145deg,var(--bg2),var(--bg3))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--txt2)' }}>
            {company.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px', marginBottom: 3 }}>{company.name}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--txt3)', fontWeight: 500 }}>
              {company.city} · {INDUSTRY_LABEL[company.industry || ''] || '—'}
              {company.employee_range && ` · ${company.employee_range} MA`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ background: ps.bg, color: ps.color, fontWeight: 800, fontSize: 14, padding: '4px 12px', borderRadius: 99 }}>{company.priority}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{company.score}p</span>
          <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--txt3)', display: 'flex', alignItems: 'center', padding: 4 }}><ExternalLink size={15} /></a>
          <button onClick={onClose} style={{ color: 'var(--txt3)', padding: 4, fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      </div>

      {/* Services */}
      {company.services?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionTitle>Leistungen</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {company.services.map((s, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99, background: 'var(--bg2)', color: 'var(--txt2)', border: '1px solid var(--border)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Jobs */}
      <div style={{ marginBottom: 20 }}>
        <SectionTitle icon={<Briefcase size={13} />}>Offene Stellen ({detail.jobs.length})</SectionTitle>
        {detail.jobs.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--txt3)' }}>Keine aktiven Stellen</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {detail.jobs.map((j: Job) => (
                <a key={j.id} href={j.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-sm)', textDecoration: 'none' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>{j.titel}</p>
                    <p style={{ fontSize: 12, color: 'var(--txt3)' }}>{j.ort}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {j.score > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{j.score}p</span>}
                    <ExternalLink size={12} color="var(--txt3)" />
                  </div>
                </a>
              ))}
            </div>
        }
      </div>

      {/* Projects */}
      {detail.projects.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionTitle icon={<TrendingUp size={13} />}>Projekt-Signale ({detail.projects.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.projects.map((p: Project) => (
              <div key={p.id} style={{ padding: '10px 12px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-txt)' }}>{p.title}</p>
                <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{p.project_type} · {p.location}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts */}
      {detail.contacts.length > 0 && (
        <div>
          <SectionTitle icon={<Users size={13} />}>Kontakte ({detail.contacts.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.contacts.map((c: Contact) => (
              <div key={c.id} style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{c.name}</p>
                {c.title && <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>{c.title}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data hint */}
      {detail.jobs.length === 0 && detail.projects.length === 0 && detail.contacts.length === 0 && (
        <div style={{ padding: '24px 16px', background: 'var(--bg2)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
          <Building2 size={32} style={{ margin: '0 auto 10px', color: 'var(--txt3)' }} />
          <p style={{ fontSize: 13, color: 'var(--txt3)' }}>Noch keine Daten gecrawlt.<br/>Der Career Agent läuft nachts automatisch.</p>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
      {icon}{children}
    </div>
  )
}
