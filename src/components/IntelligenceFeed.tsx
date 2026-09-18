import { useEffect, useState, useCallback } from 'react'
import {
  Bell, Briefcase, TrendingUp, Building2, Star,
  RefreshCw, CheckCheck, Zap, Clock, Database
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────
interface Alert {
  id: string
  alert_type: string
  message: string
  is_read: boolean
  created_at: string
  companies?: { name: string } | null
}

interface CrawlerStats {
  companies: number
  active_jobs: number
  candidates_pending: number
  queue_pending: number
  queue_done: number
  last_crawl: string | null
}

// ── Config ────────────────────────────────────────────────────
const ALERT_CONFIG: Record<string, { icon: JSX.Element; bg: string; border: string; color: string }> = {
  new_job:      { icon: <Briefcase size={14} />,  bg: '#eef0fe', border: '#d4d7fb', color: '#4338ca' },
  new_project:  { icon: <TrendingUp size={14} />, bg: '#e7f5ec', border: '#bfe6cd', color: '#1f7a45' },
  new_company:  { icon: <Building2 size={14} />,  bg: '#fdf0db', border: '#f4d59a', color: '#9a6212' },
  score_change: { icon: <Star size={14} />,       bg: '#fdf0db', border: '#f4d59a', color: '#9a6212' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'gerade eben'
  if (m < 60) return `vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std.`
  return `vor ${Math.floor(h / 24)} Tagen`
}

// ── Component ─────────────────────────────────────────────────
export default function IntelligenceFeed() {
  const [alerts, setAlerts]   = useState<Alert[]>([])
  const [stats, setStats]     = useState<CrawlerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    try {
      const [alertRes, companiesRes, jobsRes, candidatesRes, queueRes, historyRes] = await Promise.all([
        supabase.from('alerts')
          .select('id,alert_type,message,is_read,created_at,companies(name)')
          .order('created_at', { ascending: false })
          .limit(50)
          .then(r => unreadOnly ? { ...r, data: r.data?.filter(a => !a.is_read) } : r),
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('company_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('crawl_queue').select('status'),
        supabase.from('crawl_history').select('finished_at').order('finished_at', { ascending: false }).limit(1),
      ])

      const queueData = queueRes.data || []
      setAlerts((alertRes.data as any) || [])
      setStats({
        companies: companiesRes.count || 0,
        active_jobs: jobsRes.count || 0,
        candidates_pending: candidatesRes.count || 0,
        queue_pending: queueData.filter(q => q.status === 'pending').length,
        queue_done: queueData.filter(q => q.status === 'done').length,
        last_crawl: historyRes.data?.[0]?.finished_at || null,
      })
    } finally {
      setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => { load() }, [load])

  const markRead = async (id: string) => {
    await supabase.from('alerts').update({ is_read: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  const markAllRead = async () => {
    const ids = alerts.filter(a => !a.is_read).map(a => a.id)
    if (!ids.length) return
    await supabase.from('alerts').update({ is_read: true }).in('id', ids)
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

  const unreadCount = alerts.filter(a => !a.is_read).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: 'var(--page)', overflow: 'hidden' }}>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ padding: '14px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <StatCard icon={<Building2 size={15} />} label="Unternehmen" value={stats.companies} color="var(--txt)" />
            <StatCard icon={<Briefcase size={15} />} label="Aktive Stellen" value={stats.active_jobs} color="var(--accent)" />
            <StatCard icon={<Zap size={15} />} label="Kandidaten" value={stats.candidates_pending} color="#9a6212" note="warten auf Prüfung" />
            <StatCard icon={<Database size={15} />} label="Queue" value={stats.queue_pending} color={stats.queue_pending > 0 ? '#1f7a45' : 'var(--txt3)'} note={stats.queue_pending > 0 ? 'läuft' : 'leer'} />
          </div>
          {stats.last_crawl && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--txt3)' }}>
              <Clock size={12} /> Letzter Crawl: {timeAgo(stats.last_crawl)}
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
            <Bell size={14} color="var(--accent)" /> Alerts
            {unreadCount > 0 && (
              <span style={{ background: '#bb3636', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                {unreadCount}
              </span>
            )}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
            Nur ungelesen
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={ghostBtn}>
              <CheckCheck size={13} /> Alle gelesen
            </button>
          )}
          <button onClick={load} style={ghostBtn}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--txt3)', fontSize: 13 }}>Lade…</div>
        ) : alerts.length === 0 ? (
          <EmptyState stats={stats} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(alert => <AlertCard key={alert.id} alert={alert} onMarkRead={markRead} />)}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({ icon, label, value, color, note }: any) {
  return (
    <div style={{ background: 'var(--page)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--txt3)', marginBottom: 5 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px' }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>{note}</div>}
    </div>
  )
}

function AlertCard({ alert, onMarkRead }: { alert: Alert; onMarkRead: (id: string) => void }) {
  const cfg = ALERT_CONFIG[alert.alert_type] || ALERT_CONFIG['new_job']
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 16px',
      background: alert.is_read ? 'var(--bg)' : cfg.bg,
      border: `1px solid ${alert.is_read ? 'var(--border)' : cfg.border}`,
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)',
      opacity: alert.is_read ? 0.6 : 1, transition: 'opacity .15s',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: alert.is_read ? 'var(--bg2)' : cfg.bg,
        border: `1px solid ${alert.is_read ? 'var(--border)' : cfg.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: alert.is_read ? 'var(--txt3)' : cfg.color,
      }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: alert.is_read ? 400 : 600, color: 'var(--txt)', marginBottom: 4 }}>
          {alert.message}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(alert.companies as any)?.name && (
            <span style={{ fontSize: 12, color: 'var(--txt3)' }}>{(alert.companies as any).name}</span>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{timeAgo(alert.created_at)}</span>
        </div>
      </div>
      {!alert.is_read && (
        <button onClick={() => onMarkRead(alert.id)} title="Als gelesen markieren"
          style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <CheckCheck size={13} />
        </button>
      )}
    </div>
  )
}

function EmptyState({ stats }: { stats: CrawlerStats | null }) {
  return (
    <div>
      {/* Status Overview */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Zap size={15} color="var(--accent)" /> Crawler-Status
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StatusRow label="Unternehmen in Datenbank" value={stats?.companies || 0} good={true} />
          <StatusRow label="Aktive Stellenangebote" value={stats?.active_jobs || 0} good={(stats?.active_jobs || 0) > 0} />
          <StatusRow label="Kandidaten in Prüfung" value={stats?.candidates_pending || 0} good={true} note="werden automatisch validiert" />
          <StatusRow label="Queue-Einträge offen" value={stats?.queue_pending || 0} good={true} note={stats?.queue_pending ? 'läuft gerade' : 'alles abgearbeitet'} />
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 16 }}>So funktioniert der Crawler</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: <Zap size={15} />, color: '#4338ca', bg: '#eef0fe', title: 'Discovery', text: 'Sucht täglich bei Bing nach Firmen die deine Jobtitel ausschreiben' },
            { icon: <Building2 size={15} />, color: '#9a6212', bg: '#fdf0db', title: 'Validation', text: 'Prüft ob die Website erreichbar ist und eine Karriereseite hat' },
            { icon: <Briefcase size={15} />, color: '#1f7a45', bg: '#e7f5ec', title: 'Career Crawl', text: 'Liest Karriereseiten aus — täglich um 07:00 Uhr automatisch' },
            { icon: <Star size={15} />, color: '#4338ca', bg: '#eef0fe', title: 'Scoring', text: 'Gemma4 bewertet jede Stelle (0–100) und jedes Unternehmen (A+→D)' },
            { icon: <Bell size={15} />, color: '#bb3636', bg: '#fdeaea', title: 'Alert', text: 'Bei Score ≥70 oder neuen Projekt-Signalen erscheint ein Alert hier' },
          ].map(step => (
            <div key={step.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: step.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: step.color, flexShrink: 0 }}>
                {step.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 2 }}>{step.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.5 }}>{step.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, color: 'var(--accent-txt)' }}>
          Starte den Discovery Agent in den <strong>Einstellungen → Server Control</strong> um jetzt sofort neue Unternehmen zu finden.
        </div>
      </div>
    </div>
  )
}

function StatusRow({ label, value, good, note }: { label: string; value: number; good: boolean; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <span style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 500 }}>{label}</span>
        {note && <span style={{ fontSize: 11.5, color: 'var(--txt3)', marginLeft: 8 }}>{note}</span>}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: good ? (value > 0 ? '#1f7a45' : 'var(--txt3)') : '#bb3636', minWidth: 32, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--txt2)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
}
