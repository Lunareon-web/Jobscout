import { useStore } from '../store'

export function LogPanel() {
  const { searchLog } = useStore()

  if (!searchLog.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fog)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <p style={{ fontSize: 13 }}>Noch keine Suche durchgeführt.<br/>Klicke auf <strong style={{ color: 'var(--paper)' }}>Suche starten</strong>.</p>
      </div>
    )
  }

  const total = searchLog.reduce((s, l) => s + l.anzahl, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Summary */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', marginBottom: 12,
        background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 'var(--r-lg)',
        fontSize: 13,
      }}>
        <span style={{ color: 'var(--fog-2)' }}>Gesamt gefunden (vor Deduplizierung)</span>
        <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 18 }}>{total}</span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--ink-3)' }}>
              {['Quelle', 'Jobs', 'Zeit', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', textAlign: h === 'Jobs' || h === 'Zeit' ? 'right' : 'left',
                  fontSize: 10, color: 'var(--fog)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
                  borderBottom: '1px solid var(--ink-4)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {searchLog.map((l, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: i < searchLog.length - 1 ? '1px solid var(--ink-4)' : 'none',
                  background: l.anzahl > 0 ? 'transparent' : 'var(--ink-3)',
                }}
              >
                <td style={{ padding: '10px 14px', color: 'var(--paper)', fontWeight: 500 }}>{l.quelle}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: l.anzahl > 0 ? 'var(--gold)' : 'var(--fog)', fontWeight: l.anzahl > 0 ? 700 : 400, fontSize: 14 }}>
                  {l.anzahl}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--fog)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {l.ms ? `${l.ms}ms` : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {l.ok ? (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--green-dim)', color: 'var(--green)', fontWeight: 600 }}>OK</span>
                  ) : (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--red-dim)', color: 'var(--red)', fontWeight: 600 }} title={l.fehler}>Fehler</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
