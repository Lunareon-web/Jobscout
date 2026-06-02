import { useEffect, useState } from 'react'
import { Bell, BellOff, Briefcase, Building2, TrendingUp, Star, CheckCheck } from 'lucide-react'
import { intelligenceApi, type Alert } from '../lib/intelligence-api'

const ALERT_ICON: Record<string, JSX.Element> = {
  new_job:      <Briefcase size={16} className="text-blue-400" />,
  new_project:  <TrendingUp size={16} className="text-emerald-400" />,
  new_company:  <Building2 size={16} className="text-purple-400" />,
  score_change: <Star size={16} className="text-yellow-400" />,
}

const ALERT_BG: Record<string, string> = {
  new_job:      'border-blue-500/20 bg-blue-500/5',
  new_project:  'border-emerald-500/20 bg-emerald-500/5',
  new_company:  'border-purple-500/20 bg-purple-500/5',
  score_change: 'border-yellow-500/20 bg-yellow-500/5',
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
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)

  const load = async () => {
    setLoading(true)
    setApiError(false)
    try {
      const res = await intelligenceApi.getAlerts(unreadOnly)
      setAlerts(res.data)
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [unreadOnly])

  const markRead = async (id: string) => {
    await intelligenceApi.markAlertRead(id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  const markAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read)
    await Promise.all(unread.map(a => intelligenceApi.markAlertRead(a.id)))
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

  if (apiError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
      <BellOff size={48} strokeWidth={1} />
      <p className="text-sm text-center">Backend nicht erreichbar.<br />Starte <code>jobscout-backend/start.bat</code></p>
    </div>
  )

  const unreadCount = alerts.filter(a => !a.is_read).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell size={18} />
          <span className="font-semibold">Intelligence Feed</span>
          {unreadCount > 0 && (
            <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => setUnreadOnly(e.target.checked)}
              className="rounded"
            />
            Nur ungelesen
          </label>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
            >
              <CheckCheck size={14} /> Alle gelesen
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">Lade...</div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500">
            <BellOff size={36} strokeWidth={1} />
            <span className="text-sm">Keine Alerts vorhanden</span>
            <span className="text-xs text-gray-600">Discovery Agent starten um Unternehmen zu finden</span>
          </div>
        ) : alerts.map(alert => (
          <div
            key={alert.id}
            className={`flex gap-3 p-3 rounded-lg border transition-all ${ALERT_BG[alert.alert_type] || 'border-white/10 bg-white/5'} ${!alert.is_read ? 'ring-1 ring-white/20' : 'opacity-60'}`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {ALERT_ICON[alert.alert_type] || <Bell size={16} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{alert.message}</p>
              {alert.companies && (
                <p className="text-xs text-gray-500 mt-0.5">{alert.companies.name}</p>
              )}
              <p className="text-xs text-gray-600 mt-1">{timeAgo(alert.created_at)}</p>
            </div>
            {!alert.is_read && (
              <button
                onClick={() => markRead(alert.id)}
                className="text-gray-600 hover:text-gray-300 flex-shrink-0 mt-0.5"
                title="Als gelesen markieren"
              >
                <CheckCheck size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
