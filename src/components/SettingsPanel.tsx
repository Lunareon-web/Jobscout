import { Save, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { toast } from 'react-hot-toast'

const DEFAULT_JOBTITEL = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

export function SettingsPanel() {
  const { config, setConfig } = useStore()

  function save() {
    toast.success('Einstellungen gespeichert')
  }

  function reset() {
    setConfig({ standort: 'Düsseldorf', umkreis: 50, maxTage: 15, jobtitel: DEFAULT_JOBTITEL })
    toast.success('Zurückgesetzt')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Search params */}
      <section style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 'var(--r-lg)', padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          Suchparameter
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--fog)', letterSpacing: '0.4px' }}>Standort</span>
            <input
              value={config.standort}
              onChange={e => setConfig({ standort: e.target.value })}
              placeholder="Düsseldorf"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--fog)', letterSpacing: '0.4px' }}>Umkreis (km)</span>
            <input
              type="number" min={10} max={150}
              value={config.umkreis}
              onChange={e => setConfig({ umkreis: parseInt(e.target.value) || 50 })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--fog)', letterSpacing: '0.4px' }}>Max. Alter (Tage)</span>
            <input
              type="number" min={1} max={30}
              value={config.maxTage}
              onChange={e => setConfig({ maxTage: parseInt(e.target.value) || 15 })}
            />
          </label>
        </div>
      </section>

      {/* Jobtitel */}
      <section style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 'var(--r-lg)', padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)', marginBottom: 6 }}>Jobtitel</h3>
        <p style={{ fontSize: 11, color: 'var(--fog)', marginBottom: 12 }}>Kommasepariert — einer pro Zeile oder kommagetrennt</p>
        <textarea
          rows={8}
          value={config.jobtitel.join('\n')}
          onChange={e => setConfig({ jobtitel: e.target.value.split(/[\n,]/).map(t => t.trim()).filter(Boolean) })}
          style={{ fontSize: 12, resize: 'vertical', fontFamily: 'var(--mono)' }}
        />
        <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 6 }}>
          {config.jobtitel.length} Jobtitel konfiguriert
        </div>
      </section>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={save}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 'var(--r)',
            background: 'var(--gold)', color: 'var(--ink)',
            fontSize: 13, fontWeight: 700,
          }}
        >
          <Save size={14} /> Speichern
        </button>
        <button
          onClick={reset}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 14px', borderRadius: 'var(--r)',
            background: 'var(--ink-4)', color: 'var(--fog-2)',
            fontSize: 13, fontWeight: 500,
          }}
        >
          <RotateCcw size={14} /> Zurücksetzen
        </button>
      </div>

      {/* Info */}
      <section style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 'var(--r-lg)', padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--paper)', marginBottom: 10 }}>Architektur</h3>
        <div style={{ fontSize: 12, color: 'var(--fog)', lineHeight: 1.8, fontFamily: 'var(--mono)' }}>
          <div>Frontend  → React + Vite → Vercel</div>
          <div>Backend   → Vercel Serverless Functions (Node.js)</div>
          <div>Datenbank → Supabase (PostgreSQL)</div>
          <div>Quellen   → BA-API + RSS + Scraping (parallel)</div>
        </div>
      </section>
    </div>
  )
}
