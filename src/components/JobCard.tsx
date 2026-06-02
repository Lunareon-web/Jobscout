import { useState } from 'react'
import { ExternalLink, Star, StickyNote, Copy, MapPin, Calendar, Clock, Building2 } from 'lucide-react'
import { useStore } from '../store'
import { formatDate, daysSince, initials, isDirectFind } from '../lib/utils'
import type { Job } from '../types'

const CAT_STYLES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  design:      { bg: 'var(--blue-bg)',  color: 'var(--blue-txt)',  border: 'var(--blue-border)',  label: 'Design' },
  interior:    { bg: 'var(--teal-bg)',  color: 'var(--teal-txt)',  border: 'transparent',         label: 'Interior' },
  architektur: { bg: 'var(--green-bg)', color: 'var(--green-txt)', border: 'var(--green-border)', label: 'Architektur' },
  management:  { bg: 'var(--amber-bg)', color: 'var(--amber-txt)', border: 'var(--amber-border)', label: 'Management' },
  sonstiges:   { bg: 'var(--bg2)',      color: 'var(--txt2)',      border: 'var(--border)',       label: 'Sonstige' },
}

interface Props { job: Job }

export function JobCard({ job }: Props) {
  const { favorites, notes, toggleFavorite, setNote } = useStore()
  const [noteOpen, setNoteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderLeft: isFav ? '3px solid var(--amber-txt)' : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        transition: 'border-color .16s, box-shadow .16s, transform .16s',
        position: 'relative',
        boxShadow: hovered ? 'var(--shadow)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        borderColor: hovered ? 'var(--border2)' : 'var(--border)',
      }}
    >
      {/* NEU badge */}
      {isNew && (
        <span style={{
          position: 'absolute', top: 16, right: 18,
          background: 'var(--green-txt)', color: '#fff',
          fontSize: 9.5, fontWeight: 800, letterSpacing: '.9px',
          padding: '3px 9px', borderRadius: 'var(--radius-pill)',
        }}>NEU</span>
      )}

      <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: 46, height: 46, minWidth: 46, borderRadius: 11,
          background: `linear-gradient(145deg, var(--bg2), var(--bg3))`,
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px',
          color: 'var(--txt2)',
        }}>{avi}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + Company */}
          <h3 style={{
            fontSize: 15.5, fontWeight: 700, color: 'var(--txt)',
            lineHeight: 1.35, marginBottom: 3, letterSpacing: '-.2px',
            paddingRight: 48,
          }} className="truncate">
            {job.titel}
          </h3>
          <p style={{ fontSize: 13.5, color: 'var(--txt2)', marginBottom: 11, fontWeight: 500 }} className="truncate">
            {job.unternehmen || '—'}
          </p>

          {/* Meta */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginBottom: 11 }}>
            {job.ort && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt3)', fontWeight: 500 }}>
                <MapPin size={14} color="var(--txt3)" /> {job.ort}{job.plz ? ` (${job.plz})` : ''}
              </span>
            )}
            {job.datum && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt3)', fontWeight: 500 }}>
                <Calendar size={14} color="var(--txt3)" /> {formatDate(job.datum)}
                {days !== null && <span>· vor {days}d</span>}
              </span>
            )}
            {job.arbeitszeit && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt3)', fontWeight: 500 }}>
                <Clock size={14} color="var(--txt3)" /> {job.arbeitszeit}
              </span>
            )}
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 13 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)',
              background: cat.bg, color: cat.color,
              border: `1px solid ${cat.border}`,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {cat.label}
            </span>
            {isDirekt && (
              <span style={{
                fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                background: 'var(--amber-bg)', color: 'var(--amber-txt)',
                border: '1px solid var(--amber-border)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Building2 size={11} /> Direktfund
              </span>
            )}
            <span style={{
              fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)',
              background: 'var(--bg2)', color: 'var(--txt2)',
              border: '1px solid var(--border)',
            }}>
              {job.quelle.replace('Direkt: ', '')}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Favorite star */}
            <button
              onClick={() => toggleFavorite(job.id)}
              title={isFav ? 'Favorit entfernen' : 'Als Favorit markieren'}
              style={{
                background: 'none', padding: '3px', borderRadius: 6, flexShrink: 0,
                color: isFav ? 'var(--amber-txt)' : 'var(--txt3)',
                fontSize: 20, lineHeight: 1, display: 'flex',
                transition: 'color .15s, transform .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <Star size={18} fill={isFav ? 'currentColor' : 'none'} />
            </button>

            {/* Link to job */}
            <a
              href={job.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)', color: '#fff',
                border: 'none',
                fontSize: 12.5, fontWeight: 600,
                boxShadow: '0 4px 12px -3px rgba(79,70,229,.5)',
                transition: 'background .16s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
            >
              <ExternalLink size={13} /> Zur Stelle
            </a>

            {/* Note button */}
            <button
              onClick={() => setNoteOpen(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: noteOpen || note ? 'var(--accent-soft)' : 'var(--bg)',
                color: noteOpen || note ? 'var(--accent-txt)' : 'var(--txt2)',
                fontSize: 12.5, fontWeight: 600,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <StickyNote size={13} /> Notiz
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              title="Kopieren"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: copied ? 'var(--green-txt)' : 'var(--txt2)',
                fontSize: 12.5,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Copy size={13} /> {copied ? '✓' : ''}
            </button>
          </div>

          {/* Note textarea */}
          {(noteOpen || note) && (
            <div style={{ marginTop: 13 }}>
              <textarea
                rows={2}
                placeholder="Notiz zu dieser Stelle…"
                value={note}
                onChange={e => setNote(job.id, e.target.value)}
                style={{ fontSize: 13, minHeight: 62, resize: 'vertical', background: 'var(--bg2)' }}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
