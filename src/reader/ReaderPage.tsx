import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, logEvent, binToBlob } from '../db'
import { updateProgress } from '../lib/library'
import { SessionTracker } from '../lib/session'
import { getDocumentSafe, type PdfDocument } from '../lib/pdf'
import { useSettings, useT, fontCss } from '../stores/settings'
import { useToasts } from '../stores/toast'
import { tts } from '../tts/controller'
import { loadSystemVoices } from '../tts/system'
import type { ReadingLocation } from '../types'
import type { ReaderEvents, SelectionInfo, TtsStartRequest } from './types'
import { TextView, type ViewHandle } from './TextView'
import { PdfView } from './PdfView'
import { EpubView } from './EpubView'
import { SelectionPopup, ActionDock, TypographySheet } from './chrome'
import { IconBack, IconAa, IconPages, IconScroll } from '../components/Icons'

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const { reader, theme, tts: ttsSettings, lang } = useSettings()
  const show = useToasts((s) => s.show)

  const book = useLiveQuery(() => (id ? db.books.get(id) : undefined), [id])
  const highlights = useLiveQuery(
    () => (id ? db.highlights.where('bookId').equals(id).toArray() : []),
    [id],
    [],
  )

  const [content, setContent] = useState<{ kind: 'epub'; data: ArrayBuffer } | { kind: 'pdf'; doc: PdfDocument } | { kind: 'text'; text: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [sel, setSel] = useState<SelectionInfo | null>(null)
  const [hlPopup, setHlPopup] = useState<{ id: string; rect: SelectionInfo['rect'] } | null>(null)
  const [noteFor, setNoteFor] = useState<{ hlId: string; existing?: string } | null>(null)
  const [typoOpen, setTypoOpen] = useState(false)
  const [progress, setProgress] = useState(0)

  const viewRef = useRef<ViewHandle>(null)
  const trackerRef = useRef<SessionTracker | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ---------- carga de contenido ----------
  useEffect(() => {
    if (!book) return
    let alive = true
    ;(async () => {
      try {
        const file = await db.files.get(book.id)
        if (!alive) return
        if (!file) throw new Error('No se encontró el archivo del libro')
        const blob = binToBlob(file)
        if (book.format === 'epub') {
          const data = await blob.arrayBuffer()
          if (alive) setContent({ kind: 'epub', data })
        } else if (book.format === 'pdf') {
          const data = await blob.arrayBuffer()
          const doc = await getDocumentSafe(data)
          if (alive) setContent({ kind: 'pdf', doc })
        } else {
          const text = await blob.text()
          if (alive) setContent({ kind: 'text', text })
        }
      } catch (err) {
        console.error('[reader] no se pudo abrir el libro:', err)
        if (alive) setLoadError(String((err as Error)?.message ?? err))
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, book?.format])

  // ---------- sesión de lectura ----------
  useEffect(() => {
    if (!book) return
    if (trackerRef.current) return
    const tracker = new SessionTracker(book.id, book.progress)
    trackerRef.current = tracker
    setProgress(book.progress)
    void logEvent('book_opened', book.id)
    const end = () => void tracker.stop()
    window.addEventListener('beforeunload', end)
    window.addEventListener('pagehide', end)
    return () => {
      window.removeEventListener('beforeunload', end)
      window.removeEventListener('pagehide', end)
      tts.stop()
      void tracker.stop()
      trackerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id])

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        viewRef.current?.next()
        trackerRef.current?.pageTurn()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        viewRef.current?.prev()
        trackerRef.current?.pageTurn()
      } else if (e.key === 'Escape') {
        navigate(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // ---------- TTS ----------
  const startTts = useCallback(
    async (req: TtsStartRequest) => {
      if (!book) return
      let voiceId = ttsSettings.voiceId
      const want = (book.language ?? lang).slice(0, 2).toLowerCase()
      if (!voiceId || voiceId.startsWith('system:')) {
        const voices = await loadSystemVoices()
        const exists = voiceId && voices.some((v) => `system:${v.voiceURI}` === voiceId)
        if (!exists) {
          const match =
            voices.find((v) => v.lang.toLowerCase().startsWith(want) && v.localService) ??
            voices.find((v) => v.lang.toLowerCase().startsWith(want)) ??
            voices[0]
          // En iOS getVoices() puede venir vacío hasta el primer speak:
          // hablar igualmente con la voz por defecto del sistema.
          voiceId = match ? `system:${match.voiceURI}` : `system:default:${want}`
        }
      }
      let artworkUrl: string | undefined
      const cover = await db.covers.get(book.id)
      if (cover) artworkUrl = URL.createObjectURL(binToBlob(cover))

      void logEvent('tts_started', book.id)
      await tts.start(
        {
          sentences: req.sentences,
          title: book.title,
          author: book.author,
          artworkUrl,
        },
        req.startIndex,
        voiceId!,
        ttsSettings.rate,
        {
          onSentence: req.onSentence,
          onNeedMore: req.more,
          onStatus: (s) => trackerRef.current?.setTts(s === 'playing'),
          onStop: () => {
            req.onStop()
            trackerRef.current?.setTts(false)
            void logEvent('tts_stopped', book.id)
          },
        },
        book.id,
      )
    },
    [book, ttsSettings, lang, show],
  )

  // ---------- eventos del lector ----------
  const events = useMemo<ReaderEvents>(
    () => ({
      onProgress: (p, location: ReadingLocation) => {
        setProgress(p)
        trackerRef.current?.setProgress(p)
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(async () => {
          if (!book) return
          const justFinished = await updateProgress(book.id, p, location)
          if (justFinished) show(`«${book.title}» ${t('library.finishedToast')}`, 'celebrate')
        }, 800)
      },
      onSelection: (s) => {
        setSel(s)
        if (s) setHlPopup(null)
      },
      onWordTap: (req) => void startTts(req),
      onPageTurn: () => trackerRef.current?.pageTurn(),
      onActivity: () => trackerRef.current?.touch(),
      onBlankTap: () => setChromeVisible((v) => !v),
      onHighlightTap: (hlId, rect) => {
        setSel(null)
        setHlPopup({ id: hlId, rect })
      },
    }),
    [book, show, t, startTts],
  )

  // ---------- acciones de subrayado ----------
  const createHighlight = useCallback(
    async (withNote: boolean) => {
      if (!sel || !book) return
      const hlId = uid()
      await db.highlights.add({
        id: hlId,
        bookId: book.id,
        quote: sel.quote.trim(),
        anchor: sel.anchor,
        chapter: sel.chapter,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await logEvent('highlight_created', book.id, { chars: sel.quote.length })
      window.getSelection()?.removeAllRanges()
      setSel(null)
      if (withNote) setNoteFor({ hlId })
    },
    [sel, book],
  )

  const deleteHighlight = useCallback(async () => {
    if (!hlPopup) return
    await db.highlights.delete(hlPopup.id)
    await logEvent('highlight_deleted', book?.id)
    setHlPopup(null)
  }, [hlPopup, book])

  const saveNote = useCallback(
    async (text: string) => {
      if (!noteFor) return
      await db.highlights.update(noteFor.hlId, { note: text, updatedAt: Date.now() })
      await logEvent('note_added', book?.id)
      setNoteFor(null)
    },
    [noteFor, book],
  )

  // ---------- acciones del dock ----------

  /** Play: desde la selección si existe; si no, desde lo visible arriba. */
  const dockPlay = useCallback(() => {
    if (sel?.speak) {
      const fn = sel.speak
      window.getSelection()?.removeAllRanges()
      setSel(null)
      fn()
    } else {
      viewRef.current?.speakFromTop()
    }
  }, [sel])

  /** Nota: sobre la selección, o anclada a la posición actual del libro. */
  const dockNote = useCallback(async () => {
    if (sel) {
      await createHighlight(true)
      return
    }
    if (!book) return
    const ca = await viewRef.current?.currentAnchor()
    if (!ca) return
    const hlId = uid()
    await db.highlights.add({
      id: hlId,
      bookId: book.id,
      quote: ca.quote,
      anchor: ca.anchor,
      chapter: ca.chapter,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await logEvent('highlight_created', book.id, { positional: true })
    setNoteFor({ hlId })
  }, [sel, book, createHighlight])

  const dockHighlight = useCallback(() => {
    if (sel) void createHighlight(false)
    else show(t('reader.selectFirst'))
  }, [sel, createHighlight, show, t])

  // ---------- variables visuales ----------
  const themeVars = useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      ink: cs.getPropertyValue('--ink').trim() || '#2b2620',
      bg: cs.getPropertyValue('--bg').trim() || '#f4efe6',
      highlight: cs.getPropertyValue('--highlight-solid').trim() || '#f3d986',
      accent: cs.getPropertyValue('--accent').trim() || '#b8860b',
    }
    // se recalcula al cambiar el tema
  }, [theme])

  const readerStyle = {
    '--reader-font': fontCss(reader.fontFamily),
    '--reader-size': `${reader.fontSize}px`,
    '--reader-leading': String(reader.lineHeight),
    // En el tope del slider, el texto ocupa todo el ancho disponible
    '--reader-measure': reader.measure >= 96 ? '100%' : `${reader.measure}ch`,
  } as React.CSSProperties

  if (!book) return null

  const setFlow = async (mode: 'paginated' | 'scrolled') => {
    if (book.flowMode === mode) return
    tts.stop()
    await db.books.update(book.id, { flowMode: mode, updatedAt: Date.now() })
  }

  const hlForPopup = highlights?.find((h) => h.id === hlPopup?.id)

  return (
    <div className="reader-root" style={readerStyle} data-reading-font={reader.fontFamily}>
      <header className={`reader-top ${chromeVisible ? '' : 'hidden'}`}>
        <div className="reader-top-pill glass">
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.close')}>
            <IconBack />
          </button>
        </div>
        <span className="title">{book.title}</span>
        <div className="reader-top-pill glass">
          <button
            className="icon-btn"
            onClick={() => setFlow(book.flowMode === 'paginated' ? 'scrolled' : 'paginated')}
            title={book.flowMode === 'paginated' ? t('reader.scrolled') : t('reader.paginated')}
          >
            {book.flowMode === 'paginated' ? <IconScroll /> : <IconPages />}
          </button>
          <button className="icon-btn" onClick={() => setTypoOpen(true)} aria-label={t('reader.typography')}>
            <IconAa />
          </button>
        </div>
      </header>

      <div className="reader-content">
        {!content && !loadError && <div className="empty-state"><p>{t('reader.loading')}</p></div>}
        {loadError && (
          <div className="empty-state">
            <span className="ornament">⚠</span>
            <p style={{ color: 'var(--danger)' }}>{loadError}</p>
          </div>
        )}
        {content?.kind === 'text' && (
          <TextView
            ref={viewRef}
            text={content.text}
            bookId={book.id}
            language={book.language}
            flowMode={book.flowMode}
            highlights={highlights ?? []}
            initialOffset={book.location?.kind === 'text' ? book.location.offset : 0}
            events={events}
          />
        )}
        {content?.kind === 'pdf' && (
          <PdfView
            ref={viewRef}
            pdf={content.doc}
            bookId={book.id}
            language={book.language}
            flowMode={book.flowMode}
            highlights={highlights ?? []}
            initialPage={book.location?.kind === 'pdf' ? book.location.page : 1}
            events={events}
          />
        )}
        {content?.kind === 'epub' && (
          <EpubView
            ref={viewRef}
            data={content.data}
            bookId={book.id}
            language={book.language}
            flowMode={book.flowMode}
            highlights={highlights ?? []}
            initialCfi={book.location?.kind === 'epub' ? book.location.cfi : undefined}
            settings={reader}
            themeVars={themeVars}
            events={events}
          />
        )}

        <button className="page-nav-btn prev" onClick={() => viewRef.current?.prev()} aria-label="←">
          <IconBack />
        </button>
        <button className="page-nav-btn next" onClick={() => viewRef.current?.next()} aria-label="→">
          <IconBack style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>

      <footer className={`reader-footer ${chromeVisible ? '' : 'hidden'}`}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress * 100)}%</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span style={{ fontStyle: 'italic' }}>{book.author}</span>
      </footer>

      {sel && (
        <SelectionPopup
          rect={sel.rect}
          onHighlight={() => void createHighlight(false)}
          onNote={() => void createHighlight(true)}
          onSpeak={
            sel.speak
              ? () => {
                  const fn = sel.speak!
                  window.getSelection()?.removeAllRanges()
                  setSel(null)
                  fn()
                }
              : undefined
          }
          onClose={() => setSel(null)}
        />
      )}

      {hlPopup && (
        <SelectionPopup
          rect={hlPopup.rect}
          onNote={() => {
            setNoteFor({ hlId: hlPopup.id, existing: hlForPopup?.note })
            setHlPopup(null)
          }}
          onDelete={() => void deleteHighlight()}
          onClose={() => setHlPopup(null)}
        />
      )}

      {noteFor && <NoteModal existing={noteFor.existing} onSave={saveNote} onClose={() => setNoteFor(null)} />}
      {typoOpen && <TypographySheet onClose={() => setTypoOpen(false)} />}
      <ActionDock
        onPlay={dockPlay}
        onNote={() => void dockNote()}
        onHighlight={dockHighlight}
        hasSelection={!!sel}
        bookLang={book.language}
      />
    </div>
  )
}

function NoteModal({
  existing,
  onSave,
  onClose,
}: {
  existing?: string
  onSave: (text: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(existing ?? '')
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{t('reader.addNote')}</h3>
        <div className="field">
          <textarea
            rows={5}
            autoFocus
            placeholder={t('reader.notePrompt')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(text)}>
            {t('reader.noteSave')}
          </button>
        </div>
      </div>
    </div>
  )
}
