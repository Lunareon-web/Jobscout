import { useState } from 'react'
import { ExternalLink, Star, StickyNote, Copy, MapPin, Calendar, Clock, Building2 } from 'lucide-react'
import { useStore } from '../store'
import { formatDate, daysSince, initials, isDirectFind } from '../lib/utils'
import type { Job } from '../types'

const CAT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  design:       { bg: 'var(--cat-design-dim)',   color: 'var(--cat-design)',   label: 'Design' },
  interior:     { bg: 'var(--cat-interior-dim)', color: 'var(--cat-interior)', label: 'Interior' },
  architektur:  { bg: 'var(--cat-arch-dim)',     color: 'var(--cat-arch)',     label: 'Architektur' },
  management:   { bg: 'var(--cat-mgmt-dim)',     color: 'var(--cat-mgmt)',     label: 'Management' },
  sonstiges:    { bg: 'rgba(255,255,255,0.05)',  color: 'var(--fog-2)',        label: 'Sonstige' },
}

interface Props { job: Job }

export function JobCard({ job }: Props) {
  const { favorites, notes, toggleFavorite, setNote } = useStore()
  const [noteOpen, setNoteOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const isFav = favorites.has(job.id)
  const days = daysSince(job.datum)
  const isNew = days !== null && days <= 2
  const isDirekt = isDirectFind(job)
  const cat = CAT_STYLES[job.kategorie] ?? CAT_STYLES.sonstiges
  const note = notes[job.id] || ''
  const avi = initials(job.unternehmen || job.titel)

  function handleCopy() {
    navigator.clipboard.writeText(
      `${job.titel} | ${job.unternehmen} | ${job.ort} | ${formatDate(job.datum)} | ${job.url}`
    ).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  return (
    <article
      style={{
        background: 'var(--ink-2)',
        border: isFav ? '1px solid rgba(201,168,76,0.4)' : '1px solid var(--ink-4)',
        borderLeft: isFav ? '3px solid var(--gold)' : undefined,
        borderRadius: 'var(--r-lg)',
        padding: '16px 18px',
        transition: 'border-color 200ms var(--ease), transform 200ms var(--ease)',
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = isFav ? 'rgba(201,168,76,0.5)' : 'var(--ink-5)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = isFav ? 'rgba(201,168,76,0.4)' : 'var(--ink-4)')}
    >
      {isNew && (
        <span style={{
          position: 'absolute', top: 14, right: 14,
          background: 'var(--green-dim)', color: 'var(--green)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.6px',
          padding: '2px 8px', borderRadius: 99,
        }}>NEU</span>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, minWidth: 40, borderRadius: 10,
          background: cat.bg, color: cat.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: '-0.5px',
          border: `1px solid ${cat.color}22`,
        }}>{avi}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--paper)', lineHeight: 1.3, marginBottom: 2 }} className="truncate">
                {job.titel}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--fog-2)' }} className="truncate">{job.unternehmen || '—'}</p>
            </div>
            <button
              onClick={() => toggleFavorite(job.id)}
              title={isFav ? 'Favorit entfernen' : 'Als Favorit markieren'}
              style={{
                background: 'none', padding: '2px 4px', borderRadius: 6, flexShrink: 0,
                color: isFav ? 'var(--gold)' : 'var(--fog)',
              }}
            >
              <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', margin: '8px 0' }}>
            {job.ort && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fog-2)' }}>
                <MapPin size={12} /> {job.ort}{job.plz ? ` (${job.plz})` : ''}
              </span>
            )}
            {job.datum && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fog-2)' }}>
                <Calendar size={12} /> {formatDate(job.datum)}
                {days !== null && <span style={{ color: 'var(--fog)' }}>· vor {days}d</span>}
              </span>
            )}
            {job.arbeitszeit && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fog)' }}>
                <Clock size={12} /> {job.arbeitszeit}
              </span>
            )}
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600, letterSpacing: '0.3px' }}>
              {cat.label}
            </span>
            {isDirekt && (
              <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: 'rgba(201,168,76,0.1)', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Building2 size={10} /> Direktfund
              </span>
            )}
            <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: 'var(--ink-4)', color: 'var(--fog-2)' }}>
              {job.quelle.replace('Direkt: ', '')}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={job.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 'var(--r)',
                background: 'var(--gold)', color: 'var(--ink)',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.3px',
                transition: 'opacity 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <ExternalLink size={13} /> Zur Stelle →
            </a>
            <button
              onClick={() => setNoteOpen(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 'var(--r)',
                background: noteOpen || note ? 'var(--gold-dim)' : 'var(--ink-4)',
                color: noteOpen || note ? 'var(--gold)' : 'var(--fog-2)',
                fontSize: 12, fontWeight: 500,
              }}
            >
              <StickyNote size={13} /> Notiz
            </button>
            <button
              onClick={handleCopy}
              title="Kopieren"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 10px', borderRadius: 'var(--r)',
                background: 'var(--ink-4)', color: copied ? 'var(--green)' : 'var(--fog-2)',
                fontSize: 12,
              }}
            >
              <Copy size={13} /> {copied ? '✓' : ''}
            </button>
          </div>

          {/* Note */}
          {(noteOpen || note) && (
            <div style={{ marginTop: 10 }}>
              <textarea
                rows={2}
                placeholder="Notiz zu dieser Stelle…"
                value={note}
                onChange={e => setNote(job.id, e.target.value)}
                style={{ fontSize: 12, minHeight: 56, resize: 'vertical' }}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
