import { useEffect, useState, useCallback } from 'react'
import { Bell, Briefcase, TrendingUp, Building2, Star, RefreshCw, CheckCheck, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Alert {
  id: string
  alert_type: string
  company_id: string | null
  job_id: string | null
  message: string
  is_read: boolean
  created_at: string
  companies?: { name: string } | null
}

interface FeedStats {
  companies: number
  active_jobs: number
  unread_alerts: number
  new_companies_7d: number
}

const ALERT_CONFIG: Record<string, { icon: JSX.Element; bg: string; border: string; color: string }> = {
  new_job:      { icon: <Briefcase size={15} />, bg: '#eef0fe', border: '#d4d7fb', color: '#4338ca' },
  new_project:  { icon: <TrendingUp size={15} />, bg: '#e7f5ec', border: '#bfe6cd', color: '#1f7a45' },
  new_company:  { icon: <Building2 size={15} />, bg: '#fdf0db', border: '#f4d59a', color: '#9a6212' },
  score_change: { icon: <Star size={15} />, bg: '#fdf0db', border: '#f4d59a', color: '#9a6212' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'gerade eben'
  if (m < 60) return `vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std.`
  return `vor ${Math.floor(h / 24)} Tagen`
}

export default function IntelligenceFeed() {
  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [stats, setStats]       = useState<FeedStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Load alerts
      let q = supabase
        .from('alerts')
        .select('id,alert_type,company_id,job_id,message,is_read,created_at,companies(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (unreadOnly) q = q.eq('is_read', false)
      const { data: alertData } = await q

      // Load stats
      const [companiesRes, jobsRes, alertsRes] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ])

      setAlerts(alertData || [])
      setStats({
        companies: companiesRes.count || 0,
        active_jobs: jobsRes.count || 0,
        unread_alerts: alertsRes.count || 0,
        new_companies_7d: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => { load() }, [load])

  const markRead = async (id: string) => {
    await supabase.from('alerts').update({ is_read: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
    setStats(prev => prev ? { ...prev, unread_alerts: Math.max(0, prev.unread_alerts - 1) } : prev)
  }

  const markAllRead = async () => {
    const ids = alerts.filter(a => !a.is_read).map(a => a.id)
    if (!ids.length) return
    await supabase.from('alerts').update({ is_read: true }).in('id', ids)
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
    setStats(prev => prev ? { ...prev, unread_alerts: 0 } : prev)
  }

  const unreadCount = alerts.filter(a => !a.is_read).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: 'var(--page)' }}>

      {/* ── Stats Bar ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {[
            { label: 'Unternehmen',  value: stats.companies,    color: 'var(--txt)',       icon: <Building2 size={16} /> },
            { label: 'Aktive Stellen', value: stats.active_jobs, color: 'var(--accent)',    icon: <Briefcase size={16} /> },
            { label: 'Neue Alerts',  value: stats.unread_alerts, color: '#bb3636',          icon: <Bell size={16} /> },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--txt3)', marginBottom: 6 }}>
                {s.icon}
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, letterSpacing: '-1px' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bell size={15} />
            Intelligence Feed
            {unreadCount > 0 && (
              <span style={{ background: '#bb3636', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, marginLeft: 4 }}>
                {unreadCount}
              </span>
            )}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--txt2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
            Nur ungelesen
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--txt2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
              <CheckCheck size={13} /> Alle gelesen
            </button>
          )}
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--txt2)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Feed ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--txt3)', fontSize: 13 }}>Lade…</div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Bell size={28} color="var(--accent)" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 8 }}>Keine Alerts</h3>
            <p style={{ fontSize: 13, color: 'var(--txt3)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
              Alerts erscheinen automatisch wenn der Crawler neue Jobs oder Unternehmen findet.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} color="var(--accent)" /> Discovery → neue Firmen
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Briefcase size={14} color="var(--accent)" /> Career → neue Jobs
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} color="#1f7a45" /> Project Signals
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(alert => {
              const cfg = ALERT_CONFIG[alert.alert_type] || ALERT_CONFIG['new_job']
              return (
                <div key={alert.id} style={{
                  display: 'flex', gap: 12, padding: '13px 16px',
                  background: alert.is_read ? 'var(--bg)' : cfg.bg,
                  border: `1px solid ${alert.is_read ? 'var(--border)' : cfg.border}`,
                  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)',
                  opacity: alert.is_read ? 0.65 : 1,
                  transition: 'all .15s',
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: alert.is_read ? 'var(--bg2)' : cfg.bg, border: `1px solid ${alert.is_read ? 'var(--border)' : cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: alert.is_read ? 'var(--txt3)' : cfg.color }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: alert.is_read ? 500 : 600, color: 'var(--txt)', marginBottom: 3 }}>{alert.message}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {(alert.companies as any)?.name && (
                        <span style={{ fontSize: 12, color: 'var(--txt3)', fontWeight: 500 }}>{(alert.companies as any).name}</span>
                      )}
                      <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{timeAgo(alert.created_at)}</span>
                    </div>
                  </div>
                  {!alert.is_read && (
                    <button onClick={() => markRead(alert.id)} title="Als gelesen markieren"
                      style={{ color: 'var(--txt3)', padding: 4, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <CheckCheck size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
