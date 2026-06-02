import { useEffect, useState } from 'react'
import { Building2, Briefcase, Users, TrendingUp, ExternalLink, RefreshCw, Zap } from 'lucide-react'
import { intelligenceApi, type Company, type Stats } from '../lib/intelligence-api'

const PRIORITY_COLOR: Record<string, string> = {
  'A+': 'bg-emerald-500 text-white',
  'A':  'bg-green-500 text-white',
  'B':  'bg-blue-500 text-white',
  'C':  'bg-yellow-500 text-black',
  'D':  'bg-gray-400 text-white',
}

const INDUSTRY_LABEL: Record<string, string> = {
  retail:      '🛍 Retail',
  interior:    '🪑 Interior',
  ladenbau:    '🏪 Ladenbau',
  workplace:   '🏢 Workplace',
  architektur: '🏛 Architektur',
  messebau:    '🎪 Messebau',
  other:       '📦 Sonstige',
}

export default function CompanyDashboard() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ priority: '', industry: '', minScore: 0 })
  const [apiError, setApiError] = useState(false)

  const load = async () => {
    setLoading(true)
    setApiError(false)
    try {
      const [co, st] = await Promise.all([
        intelligenceApi.getCompanies({ ...filter, limit: 100 }),
        intelligenceApi.getStats(),
      ])
      setCompanies(co.data)
      setStats(st)
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openDetail = async (id: string) => {
    setSelected(id)
    const d = await intelligenceApi.getCompany(id)
    setDetail(d)
  }

  if (apiError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
      <Building2 size={48} />
      <p className="text-sm">Backend nicht erreichbar.<br />Starte <code>jobscout-backend/start.bat</code></p>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Company List */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-white/10">
        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 p-3 border-b border-white/10">
            <StatChip icon={<Building2 size={14}/>} label="Unternehmen" value={stats.companies} />
            <StatChip icon={<Briefcase size={14}/>} label="Aktive Jobs" value={stats.active_jobs} />
            <StatChip icon={<Zap size={14}/>} label="Alerts" value={stats.unread_alerts} accent />
            <StatChip icon={<TrendingUp size={14}/>} label="Kandidaten" value={stats.pending_candidates} />
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 p-2 border-b border-white/10">
          <select
            value={filter.priority}
            onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}
            className="flex-1 bg-white/5 text-xs rounded px-2 py-1 border border-white/10"
          >
            <option value="">Alle Prioritäten</option>
            {['A+','A','B','C','D'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filter.industry}
            onChange={e => setFilter(f => ({ ...f, industry: e.target.value }))}
            className="flex-1 bg-white/5 text-xs rounded px-2 py-1 border border-white/10"
          >
            <option value="">Alle Branchen</option>
            {Object.entries(INDUSTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="p-1 hover:text-blue-400" title="Neu laden">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Lade...</div>
          ) : companies.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Keine Unternehmen</div>
          ) : companies.map(c => (
            <div
              key={c.id}
              onClick={() => openDetail(c.id)}
              className={`p-3 cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors ${selected === c.id ? 'bg-white/10' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate flex-1">{c.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ml-2 ${PRIORITY_COLOR[c.priority] || 'bg-gray-600'}`}>
                  {c.priority}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{c.city}</span>
                <span>·</span>
                <span>{INDUSTRY_LABEL[c.industry || ''] || c.industry || '—'}</span>
                <span>·</span>
                <span className="text-blue-400">{c.score}p</span>
              </div>
            </div>
          ))}
        </div>

        {/* Discovery Button */}
        <div className="p-2 border-t border-white/10">
          <button
            onClick={() => { intelligenceApi.runDiscovery(); load() }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded flex items-center justify-center gap-2"
          >
            <Zap size={14} /> Discovery starten
          </button>
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="flex-1 overflow-y-auto p-4">
        {!detail ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <Building2 size={48} strokeWidth={1} />
            <span className="text-sm">Unternehmen auswählen</span>
          </div>
        ) : (
          <CompanyDetail data={detail} />
        )}
      </div>
    </div>
  )
}

function StatChip({ icon, label, value, accent }: any) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${accent ? 'bg-orange-500/20' : 'bg-white/5'}`}>
      <span className={accent ? 'text-orange-400' : 'text-gray-400'}>{icon}</span>
      <div>
        <div className={`text-sm font-bold ${accent ? 'text-orange-300' : 'text-white'}`}>{value ?? '—'}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}

function CompanyDetail({ data }: { data: any }) {
  const { company, jobs, contacts, projects } = data

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{company.name}</h2>
          <p className="text-gray-400 text-sm mt-1">
            {company.city} · {INDUSTRY_LABEL[company.industry] || company.industry || 'Unbekannte Branche'}
            {company.employee_range && ` · ${company.employee_range} MA`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{company.score}</div>
            <div className="text-xs text-gray-500">Score</div>
          </div>
          <span className={`text-lg px-3 py-1 rounded font-bold ${PRIORITY_COLOR[company.priority]}`}>
            {company.priority}
          </span>
          <a href={company.website} target="_blank" rel="noopener noreferrer"
            className="p-2 hover:text-blue-400 text-gray-400">
            <ExternalLink size={18} />
          </a>
        </div>
      </div>

      {/* Services */}
      {company.services?.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Leistungen</h3>
          <div className="flex flex-wrap gap-2">
            {company.services.map((s: string, i: number) => (
              <span key={i} className="bg-white/10 text-xs px-2 py-1 rounded">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Jobs */}
      <div>
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
          <Briefcase size={12} /> Offene Stellen ({jobs.length})
        </h3>
        {jobs.length === 0 ? (
          <p className="text-gray-600 text-sm">Keine aktiven Stellen</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j: any) => (
              <a key={j.id} href={j.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors group">
                <div>
                  <p className="text-sm font-medium group-hover:text-blue-400">{j.titel}</p>
                  <p className="text-xs text-gray-500">{j.ort}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-400">{j.score}p</span>
                  <ExternalLink size={12} className="text-gray-600" />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <TrendingUp size={12} /> Projekt-Signale ({projects.length})
          </h3>
          <div className="space-y-2">
            {projects.map((p: any) => (
              <div key={p.id} className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded">
                <p className="text-sm font-medium text-emerald-300">{p.title}</p>
                <p className="text-xs text-gray-400">{p.project_type} · {p.location}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts */}
      {contacts.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Users size={12} /> Kontakte ({contacts.length})
          </h3>
          <div className="space-y-2">
            {contacts.map((c: any) => (
              <div key={c.id} className="p-2 bg-white/5 rounded">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-gray-400">{c.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
