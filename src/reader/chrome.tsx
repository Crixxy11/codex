// Cromo del lector: popup de selección (píldora iOS), barra TTS
// flotante y hoja de ajustes tipográficos.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings, useT, READING_FONTS, THEMES, fontCss } from '../stores/settings'
import { useTtsState, tts } from '../tts/controller'
import { listSystemVoices } from '../tts/system'
import { listPiperVoices } from '../tts/piper'
import type { TtsVoiceInfo } from '../tts/types'
import {
  IconHighlighter,
  IconNote,
  IconSpeak,
  IconPlay,
  IconPause,
  IconStop,
  IconTrash,
  IconCheck,
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
    <div
      className="sel-popup"
      style={{ left: cx - width / 2, top }}
      role="menu"
      // Evita que el tap limpie la selección de texto (iOS) antes de
      // que el botón ejecute su acción.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
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

// ---------- Dock de acciones de lectura ----------

const RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]

interface DockProps {
  /** Iniciar lectura (desde selección o desde lo visible). */
  onPlay: () => void
  onNote: () => void
  onHighlight: () => void
  hasSelection: boolean
  bookLang?: string
}

export function ActionDock({ onPlay, onNote, onHighlight, hasSelection, bookLang }: DockProps) {
  const status = useTtsState((s) => s.status)
  const rate = useTtsState((s) => s.rate)
  const { tts: ttsSettings, setTts, lang } = useSettings()
  const t = useT()
  const [voicesOpen, setVoicesOpen] = useState(false)
  const [voices, setVoices] = useState<TtsVoiceInfo[] | null>(null)
  const active = status !== 'idle'

  useEffect(() => {
    if (!voicesOpen || voices) return
    void (async () => {
      const [piper, sys] = await Promise.all([listPiperVoices(), listSystemVoices()])
      const want = (bookLang ?? lang).slice(0, 2).toLowerCase()
      const ready = piper.filter((v) => v.downloaded)
      const sysSorted = [
        ...sys.filter((v) => v.lang === want),
        ...sys.filter((v) => v.lang !== want),
      ].slice(0, 14 - ready.length)
      setVoices([...ready, ...sysSorted])
    })()
  }, [voicesOpen, voices, bookLang, lang])

  const cycleRate = () => {
    const i = RATES.findIndex((r) => r >= rate - 0.01)
    const next = RATES[(i + 1) % RATES.length]
    tts.setRate(next)
    setTts({ rate: next })
  }

  const pickVoice = (v: TtsVoiceInfo) => {
    setTts({ voiceId: v.id, engine: v.engine })
    tts.setVoice(v.id)
    setVoicesOpen(false)
  }

  return (
    <div className={`action-dock glass ${active ? 'active' : ''}`} role="toolbar">
      {/* Nota — siempre presente */}
      <button className="dock-btn" onClick={onNote} title={t('reader.addNote')}>
        <IconNote />
      </button>

      {/* Grupo de audio desplegable */}
      <div className={`dock-cluster ${active ? 'open' : ''}`}>
        <button
          className="dock-btn"
          onClick={() => setVoicesOpen((v) => !v)}
          title={t('tts.voice')}
        >
          <IconSpeak />
        </button>
        <button className="dock-btn" onClick={() => tts.skipSeconds(-10)} title="−10 s">
          <Seek10 back />
        </button>
      </div>

      {/* Play / pausa — el corazón del dock */}
      <button
        className="dock-play"
        onClick={() => (active ? tts.toggle() : onPlay())}
        aria-label={status === 'playing' ? 'pause' : 'play'}
      >
        {status === 'loading' ? <Spinner /> : status === 'playing' ? <IconPause /> : <IconPlay />}
      </button>

      <div className={`dock-cluster ${active ? 'open' : ''}`}>
        <button className="dock-btn" onClick={() => tts.skipSeconds(10)} title="+10 s">
          <Seek10 />
        </button>
        <button className="dock-rate" onClick={cycleRate} title={t('tts.speed')}>
          {rate.toFixed(rate % 1 === 0 ? 0 : 2).replace(/0+$/, '').replace(/\.$/, '')}×
        </button>
        <button className="dock-btn" onClick={() => tts.stop()} title="stop">
          <IconStop width={17} height={17} />
        </button>
      </div>

      {/* Subrayado — siempre presente */}
      <button
        className="dock-btn"
        onClick={onHighlight}
        title={t('reader.highlight')}
        style={{ opacity: hasSelection ? 1 : 0.45 }}
      >
        <IconHighlighter />
      </button>

      {/* Selector de voz */}
      {voicesOpen && (
        <div className="voice-pop">
          <div className="voice-pop-title">{t('tts.voice')}</div>
          {!voices && <div className="voice-pop-empty">…</div>}
          {voices?.map((v) => {
            const selected = ttsSettings.voiceId === v.id
            return (
              <button
                key={v.id}
                className={`voice-pop-row ${selected ? 'sel' : ''}`}
                onClick={() => pickVoice(v)}
              >
                <span className="vp-name">{v.name}</span>
                <span className="vp-meta">
                  {v.langLabel}
                  {v.engine === 'piper' ? ' · ♪' : ''}
                </span>
                {selected && <IconCheck width={15} height={15} />}
              </button>
            )
          })}
          {voices?.length === 0 && <div className="voice-pop-empty">—</div>}
        </div>
      )}
    </div>
  )
}

/** Icono de salto de 10 s (flecha circular con el número). */
function Seek10({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={back ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M12 4.5a7.5 7.5 0 1 1-7.3 9.2" />
      <path d="M12 1.8v5.4l3.2-2.7z" fill="currentColor" stroke="none" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="7.4" fill="currentColor" stroke="none" fontFamily="inherit" fontWeight="700" style={back ? { transform: 'scaleX(-1)', transformOrigin: '12px 12px' } : undefined}>
        10
      </text>
    </svg>
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
            {reader.measure >= 96 ? '∞' : reader.measure}
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
