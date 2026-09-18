import { Save, RotateCcw, Zap, CheckCircle } from 'lucide-react'
import { useStore } from '../store'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { toast } from 'react-hot-toast'

const DEFAULT_JOBTITEL = [
  'Projektmanager', 'Project Manager', 'Design Manager',
  'Designer', 'Produktdesigner', 'Interior Designer',
  'Innenarchitekt', 'Raumplaner', 'Concept Designer',
  'Brand Designer', 'Visual Merchandiser',
]

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--txt2)', marginBottom: 6, fontWeight: 500, display: 'block',
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px 22px',
  boxShadow: 'var(--shadow-sm)',
}

const sectionTitle = (icon: React.ReactNode, text: string) => (
  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-.2px' }}>
    <span style={{ color: 'var(--accent)' }}>{icon}</span> {text}
  </h3>
)

export function SettingsPanel() {
  const { config, setConfig } = useStore()

  async function save() {
    if (!isSupabaseConfigured) {
      toast.error('Supabase nicht konfiguriert — nur lokal gespeichert')
      return
    }
    // Save to Supabase so the Discovery Agent can read it
    const { error } = await supabase.from('app_config').upsert({
      key: 'search_config',
      value: {
        standort: config.standort,
        umkreis: config.umkreis,
        jobtitel: config.jobtitel,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    if (error) {
      toast.error('Fehler beim Speichern')
      console.error(error)
    } else {
      toast.success('Gespeichert — Discovery Agent verwendet diese Jobtitel')
    }
  }

  function reset() {
    setConfig({ standort: 'Düsseldorf', umkreis: 50, maxTage: 15, jobtitel: DEFAULT_JOBTITEL })
    toast.success('Zurückgesetzt')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

      {/* Info Box */}
      <div style={{ padding: '12px 16px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--accent-txt)', lineHeight: 1.6 }}>
        <strong>Wie der Crawler funktioniert:</strong> Der Discovery Agent sucht bei Bing nach Unternehmen die Stellen mit deinen konfigurierten Jobtiteln ausschreiben — z.B. <em>„Interior Designer Stelle Düsseldorf"</em>. Gefundene Firmen werden automatisch validiert, ihre Karriereseiten gecrawlt und neue Jobs eingespeichert.
      </div>

      {/* Search Params */}
      <section style={sectionStyle}>
        {sectionTitle(<CheckCircle size={17} />, 'Suchparameter')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>
            <span style={labelStyle}>Standort</span>
            <input value={config.standort} onChange={e => setConfig({ standort: e.target.value })} placeholder="Düsseldorf" />
          </label>
          <label>
            <span style={labelStyle}>Umkreis (km)</span>
            <input type="number" min={10} max={150} value={config.umkreis} onChange={e => setConfig({ umkreis: parseInt(e.target.value) || 50 })} />
          </label>
          <label>
            <span style={labelStyle}>Max. Alter (Tage)</span>
            <input type="number" min={1} max={30} value={config.maxTage} onChange={e => setConfig({ maxTage: parseInt(e.target.value) || 15 })} />
          </label>
        </div>
      </section>

      {/* Jobtitel */}
      <section style={sectionStyle}>
        {sectionTitle(<Zap size={17} />, 'Jobtitel — Basis für die Unternehmens-Suche')}
        <p style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12, lineHeight: 1.6 }}>
          Der Discovery Agent sucht gezielt nach Unternehmen, die diese Rollen besetzen. Je spezifischer, desto besser die Treffer.
        </p>
        <textarea
          rows={10}
          value={config.jobtitel.join('\n')}
          onChange={e => setConfig({ jobtitel: e.target.value.split(/[\n,]/).map(t => t.trim()).filter(Boolean) })}
          style={{ fontSize: 13, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.7, background: 'var(--bg2)', borderColor: 'transparent' }}
          placeholder="Projektmanager&#10;Interior Designer&#10;Design Manager&#10;..."
        />
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 6 }}>
          {config.jobtitel.length} Jobtitel · werden für Suche + Karriere-Matching verwendet
        </div>
      </section>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 20px', borderRadius: 'var(--radius-sm)',
          background: 'var(--accent)', color: '#fff',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          boxShadow: '0 4px 12px -3px rgba(79,70,229,.5)', cursor: 'pointer',
        }}>
          <Save size={14} /> Speichern
        </button>
        <button onClick={reset} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--txt2)',
          border: '1px solid var(--border)', fontSize: 13, fontWeight: 500,
          boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
        }}>
          <RotateCcw size={14} /> Zurücksetzen
        </button>
      </div>

      {/* Architecture */}
      <section style={sectionStyle}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 10 }}>Architektur</h3>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 2, fontFamily: 'monospace' }}>
          <div>Frontend  → React + Vite → Vercel</div>
          <div>Backend   → FastAPI (lokal) + APScheduler</div>
          <div>Datenbank → Supabase (PostgreSQL)</div>
          <div>Quellen   → Bing Discovery + Direktcrawl + BA-API</div>
          <div>KI        → Ollama / gemma4-fast (lokal)</div>
        </div>
      </section>
    </div>
  )
}
