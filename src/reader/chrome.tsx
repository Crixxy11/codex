// Cromo del lector: popup de selección (píldora iOS), barra TTS
// flotante y hoja de ajustes tipográficos.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings, useT, READING_FONTS, THEMES, fontCss } from '../stores/settings'
import { useTtsState, tts } from '../tts/controller'
import {
  IconHighlighter,
  IconNote,
  IconSpeak,
  IconPlay,
  IconPause,
  IconStop,
  IconSkipBack,
  IconSkipFwd,
  IconTrash,
} from '../components/Icons'

// ---------- Popup de selección ----------

interface PopupProps {
  rect: { left: number; top: number; right: number; bottom: number }
  onHighlight?: () => void
  onNote?: () => void
  onSpeak?: () => void
  onDelete?: () => void
  onClose: () => void
}

export function SelectionPopup({ rect, onHighlight, onNote, onSpeak, onDelete, onClose }: PopupProps) {
  const t = useT()
  const width = (onHighlight ? 50 : 0) + (onNote ? 50 : 0) + (onSpeak ? 50 : 0) + (onDelete ? 50 : 0) + 10
  const cx = Math.min(Math.max((rect.left + rect.right) / 2, width / 2 + 8), window.innerWidth - width / 2 - 8)
  const above = rect.top > 90
  const top = above ? rect.top - 64 : rect.bottom + 14

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.sel-popup')) onClose()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onClose])

  return createPortal(
    <div className="sel-popup" style={{ left: cx - width / 2, top }} role="menu">
      {onHighlight && (
        <button onClick={onHighlight} title={t('reader.highlight')} aria-label={t('reader.highlight')}>
          <IconHighlighter />
        </button>
      )}
      {onNote && (
        <button onClick={onNote} title={t('reader.addNote')} aria-label={t('reader.addNote')}>
          <IconNote />
        </button>
      )}
      {onSpeak && (
        <>
          <span className="divider" />
          <button onClick={onSpeak} title={t('reader.listen')} aria-label={t('reader.listen')}>
            <IconSpeak />
          </button>
        </>
      )}
      {onDelete && (
        <>
          <span className="divider" />
          <button onClick={onDelete} title={t('reader.deleteHighlight')} style={{ color: 'var(--danger)' }}>
            <IconTrash />
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}

// ---------- Barra TTS ----------

const RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]

export function TtsBar() {
  const status = useTtsState((s) => s.status)
  const rate = useTtsState((s) => s.rate)
  const setTts = useSettings((s) => s.setTts)
  const t = useT()
  if (status === 'idle') return null

  const cycleRate = () => {
    const i = RATES.findIndex((r) => r >= rate - 0.01)
    const next = RATES[(i + 1) % RATES.length]
    tts.setRate(next)
    setTts({ rate: next })
  }

  return (
    <div className="tts-bar" role="toolbar" aria-label="TTS">
      <span className={`pulse ${status === 'playing' ? 'playing' : ''}`} />
      <button className="icon-btn" onClick={() => tts.skip(-1)} aria-label="←">
        <IconSkipBack />
      </button>
      <button className="play-btn" onClick={() => tts.toggle()} aria-label="play/pause">
        {status === 'playing' ? <IconPause /> : status === 'loading' ? <Spinner /> : <IconPlay />}
      </button>
      <button className="icon-btn" onClick={() => tts.skip(1)} aria-label="→">
        <IconSkipFwd />
      </button>
      <button className="rate-btn" onClick={cycleRate} title={t('tts.speed')}>
        {rate.toFixed(rate % 1 === 0 ? 0 : 2).replace(/0$/, '')}×
      </button>
      <button className="icon-btn" onClick={() => tts.stop()} aria-label="stop">
        <IconStop />
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 3a9 9 0 109 9">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

// ---------- Hoja de tipografía ----------

export function TypographySheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { reader, setReader, theme, setTheme } = useSettings()
  const [, force] = useState(0)
  void force

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal typo-sheet">
        <h3>{t('reader.typography')}</h3>

        <div className="font-options">
          {READING_FONTS.map((f) => (
            <button
              key={f.id}
              className={`font-option ${reader.fontFamily === f.id ? 'active' : ''}`}
              onClick={() => setReader({ fontFamily: f.id })}
            >
              <span className="sample" style={{ fontFamily: f.css }}>
                Aa
              </span>
              <span className="name">{f.label}</span>
            </button>
          ))}
        </div>

        <div className="row">
          <span>{t('reader.fontSize')}</span>
          <input
            type="range"
            min={14}
            max={30}
            step={0.5}
            value={reader.fontSize}
            onChange={(e) => setReader({ fontSize: Number(e.target.value) })}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', width: 38, textAlign: 'right' }}>
            {reader.fontSize}
          </span>
        </div>

        <div className="row">
          <span>{t('reader.lineHeight')}</span>
          <input
            type="range"
            min={1.25}
            max={2.2}
            step={0.02}
            value={reader.lineHeight}
            onChange={(e) => setReader({ lineHeight: Number(e.target.value) })}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', width: 38, textAlign: 'right' }}>
            {reader.lineHeight.toFixed(2)}
          </span>
        </div>

        <div className="row">
          <span>{t('reader.measure')}</span>
          <input
            type="range"
            min={42}
            max={96}
            step={2}
            value={reader.measure}
            onChange={(e) => setReader({ measure: Number(e.target.value) })}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', width: 38, textAlign: 'right' }}>
            {reader.measure}
          </span>
        </div>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span style={{ paddingTop: 12 }}>{t('reader.theme')}</span>
          <div className="theme-dots">
            {THEMES.map((th) => (
              <ThemeDot key={th} id={th} active={theme === th} onPick={() => setTheme(th)} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const THEME_PREVIEW: Record<string, { bg: string; ink: string }> = {
  marfil: { bg: '#f4efe6', ink: '#2b2620' },
  pergamino: { bg: '#f8f4ea', ink: '#383026' },
  sepia: { bg: '#efe3cc', ink: '#443625' },
  niebla: { bg: '#e9e8e3', ink: '#57544c' },
  noche: { bg: '#0e1420', ink: '#d8e0ee' },
  tinta: { bg: '#131110', ink: '#e8e2d6' },
  bruma: { bg: '#23252a', ink: '#c6c8cd' },
}

function ThemeDot({ id, active, onPick }: { id: string; active: boolean; onPick: () => void }) {
  const c = THEME_PREVIEW[id]
  return (
    <button
      className={`theme-dot ${active ? 'active' : ''}`}
      style={{ background: c.bg }}
      onClick={onPick}
      title={id}
    >
      <span className="aa" style={{ color: c.ink }}>
        Aa
      </span>
    </button>
  )
}

export { fontCss }
