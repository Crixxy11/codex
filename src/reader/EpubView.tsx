import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import ePub, { type Book as EpubBook, type Rendition, type Contents } from 'epubjs'
import type { Highlight, FlowMode, ReaderSettings } from '../types'
import type { ReaderEvents } from './types'
import { TextMap, splitSentences, wordAt } from '../lib/text'
import { fontCss } from '../stores/settings'
import type { ViewHandle } from './TextView'

interface Props {
  data: ArrayBuffer
  bookId: string
  language?: string
  flowMode: FlowMode
  highlights: Highlight[]
  initialCfi?: string
  settings: ReaderSettings
  themeVars: { ink: string; bg: string; highlight: string; accent: string }
  events: ReaderEvents
}

export const EpubView = forwardRef<ViewHandle, Props>(function EpubView(
  { data, language, flowMode, highlights, initialCfi, settings, themeVars, events },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<EpubBook | null>(null)
  const rendRef = useRef<Rendition | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events
  const highlightsRef = useRef(highlights)
  /** id → cfi de los subrayados ya dibujados en el rendition. */
  const drawnHl = useRef(new Map<string, string>())
  const ttsCfi = useRef<string | null>(null)
  const locationsReady = useRef(false)

  useImperativeHandle(ref, () => ({
    next: () => void rendRef.current?.next(),
    prev: () => void rendRef.current?.prev(),
  }))

  // ---------- montaje del libro ----------
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const book = ePub(data)
    bookRef.current = book
    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: flowMode === 'paginated' ? 'paginated' : 'scrolled',
      spread: 'none',
      allowScriptedContent: false,
    })
    rendRef.current = rendition
    drawnHl.current.clear()

    void rendition.display(initialCfi || undefined)

    void book.ready.then(() =>
      book.locations.generate(1200).then(() => {
        locationsReady.current = true
      }),
    )

    rendition.on('relocated', (loc: { start: { cfi: string; href: string; index: number } }) => {
      let progress = 0
      if (locationsReady.current) {
        progress = book.locations.percentageFromCfi(loc.start.cfi) ?? 0
      } else {
        const total = (book.spine as unknown as { length: number }).length || 1
        progress = loc.start.index / total
      }
      eventsRef.current.onProgress(progress, { kind: 'epub', cfi: loc.start.cfi })
      syncHighlights()
    })

    // Selección de texto dentro del iframe
    rendition.on('selected', (cfiRange: string, contents: Contents) => {
      try {
        const range = contents.window.getSelection()?.getRangeAt(0)
        if (!range) return
        const rect = range.getBoundingClientRect()
        const frame = contents.document.defaultView?.frameElement?.getBoundingClientRect()
        if (!frame) return
        const chapter = chapterFor(book, contents.sectionIndex)
        const caret = range.cloneRange()
        caret.collapse(true)
        eventsRef.current.onSelection({
          rect: {
            left: rect.left + frame.left,
            top: rect.top + frame.top,
            right: rect.right + frame.left,
            bottom: rect.bottom + frame.top,
          },
          quote: range.toString(),
          anchor: { kind: 'epub', cfi: cfiRange, sectionIndex: contents.sectionIndex },
          chapter,
          speak: () => startTtsFromPoint(contents, caret, false),
        })
      } catch {
        /* selección no mapeable */
      }
    })

    rendition.on('markClicked', (_cfiRange: string, dataAttrs: { id?: string }) => {
      const id = dataAttrs?.id
      if (!id) return
      const iframe = host.querySelector('iframe')
      const r = iframe?.getBoundingClientRect()
      eventsRef.current.onHighlightTap(id, {
        left: (r?.left ?? 0) + (r?.width ?? 0) / 2 - 40,
        top: (r?.top ?? 0) + 120,
        right: (r?.left ?? 0) + (r?.width ?? 0) / 2 + 40,
        bottom: (r?.top ?? 0) + 150,
      })
    })

    // Interacción dentro de cada capítulo renderizado
    rendition.hooks.content.register((contents: Contents) => {
      const doc = contents.document
      doc.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') void rendition.next()
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') void rendition.prev()
      })
      // Swipe táctil
      let tx = 0
      let ty = 0
      doc.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          tx = e.changedTouches[0].clientX
          ty = e.changedTouches[0].clientY
        },
        { passive: true },
      )
      doc.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          const dx = e.changedTouches[0].clientX - tx
          const dy = e.changedTouches[0].clientY - ty
          if (Math.abs(dx) > 64 && Math.abs(dy) < 56) {
            if (dx < 0) void rendition.next()
            else void rendition.prev()
            eventsRef.current.onPageTurn()
          }
        },
        { passive: true },
      )
      // Tap de palabra → TTS
      doc.addEventListener('click', (e: MouseEvent) => {
        eventsRef.current.onActivity()
        setTimeout(() => {
          const sel = contents.window.getSelection()
          if (sel && !sel.isCollapsed) return // selección: la maneja 'selected'
          eventsRef.current.onSelection(null)
          if ((e.target as HTMLElement).closest('a')) return
          const r = doc.caretRangeFromPoint?.(e.clientX, e.clientY)
          if (r) {
            const ok = startTtsFromPoint(contents, r)
            if (ok) return
          }
          eventsRef.current.onBlankTap()
        }, 10)
      })
    })

    rendition.on('rendered', () => syncHighlights())

    const syncHighlights = () => {
      const rend = rendRef.current
      if (!rend) return
      for (const h of highlightsRef.current) {
        if (h.anchor.kind !== 'epub' || drawnHl.current.has(h.id)) continue
        try {
          rend.annotations.highlight(
            h.anchor.cfi,
            { id: h.id },
            undefined,
            'codex-hl',
            { fill: themeVars.highlight, 'fill-opacity': '0.95', 'mix-blend-mode': 'multiply' },
          )
          drawnHl.current.set(h.id, h.anchor.cfi)
        } catch {
          /* cfi de otro capítulo aún no montado */
        }
      }
    }

    return () => {
      try {
        rendition.destroy()
        book.destroy()
      } catch {
        /* ya destruido */
      }
      rendRef.current = null
      bookRef.current = null
    }
    // El libro se remonta solo si cambia el archivo o el modo de flujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, flowMode])

  // ---------- tema y tipografía del iframe ----------
  useEffect(() => {
    const rend = rendRef.current
    if (!rend) return
    rend.themes.default({
      body: {
        background: 'transparent',
        color: `${themeVars.ink} !important`,
        'font-family': `${fontCss(settings.fontFamily)} !important`,
        'line-height': `${settings.lineHeight} !important`,
        'padding-left': '6px',
        'padding-right': '6px',
        'max-width': `${settings.measure}ch`,
        margin: '0 auto',
      },
      'p, li, blockquote, div': {
        color: `${themeVars.ink} !important`,
        'font-family': `${fontCss(settings.fontFamily)} !important`,
        'line-height': `${settings.lineHeight} !important`,
      },
      'h1, h2, h3, h4, h5': { color: `${themeVars.ink} !important` },
      a: { color: `${themeVars.accent} !important` },
      img: { 'max-width': '100% !important', height: 'auto' },
      '::selection': { background: themeVars.highlight },
    })
    rend.themes.fontSize(`${settings.fontSize}px`)
  }, [settings, themeVars, flowMode])

  // ---------- altas y bajas de subrayados en caliente ----------
  useEffect(() => {
    highlightsRef.current = highlights
    const rend = rendRef.current
    if (!rend) return
    const current = new Set(highlights.map((h) => h.id))
    for (const [id, cfi] of drawnHl.current) {
      if (!current.has(id)) {
        try {
          rend.annotations.remove(cfi, 'highlight')
        } catch {
          /* ignorar */
        }
        drawnHl.current.delete(id)
      }
    }
    for (const h of highlights) {
      if (h.anchor.kind !== 'epub' || drawnHl.current.has(h.id)) continue
      try {
        rend.annotations.highlight(
          h.anchor.cfi,
          { id: h.id },
          undefined,
          'codex-hl',
          { fill: themeVars.highlight, 'fill-opacity': '0.95', 'mix-blend-mode': 'multiply' },
        )
        drawnHl.current.set(h.id, h.anchor.cfi)
      } catch {
        /* capítulo no montado */
      }
    }
  }, [highlights, themeVars])

  // ---------- TTS ----------

  function startTtsFromPoint(contents: Contents, caret: Range, strict = true): boolean {
    const book = bookRef.current
    const rend = rendRef.current
    if (!book || !rend) return false
    const map = new TextMap(contents.document.body)
    const offset = map.offsetOf(caret.startContainer, caret.startOffset)
    if (offset == null) return false
    let w = wordAt(map.text, offset)
    if (!w) {
      if (strict) return false
      w = { start: offset, end: offset }
    }

    const lang = language ?? 'es'
    const sentences = splitSentences(map.text, lang)
    let si = sentences.findIndex((s) => w.start >= s.start && w.start < s.end)
    if (si < 0) si = 0
    const local = sentences.slice(si)
    // metadatos por oración: sección + offsets (para resaltar/avanzar)
    const meta: { section: number; start: number; end: number }[] = local.map((s) => ({
      section: contents.sectionIndex,
      start: s.start,
      end: s.end,
    }))
    const texts = local.map((s, i) =>
      i === 0 ? s.text.slice(w.start - s.start).trim() || s.text : s.text,
    )

    let nextSection = contents.sectionIndex + 1

    const spine = book.spine as unknown as {
      get: (i: number) => null | {
        href: string
        load: (l: unknown) => Promise<Document>
        unload: () => void
      }
    }

    eventsRef.current.onWordTap({
      sentences: texts,
      startIndex: 0,
      more: async () => {
        for (;;) {
          const section = spine.get(nextSection)
          if (!section) return null
          const idx = nextSection
          nextSection++
          try {
            const loader = book as unknown as { load: (...args: unknown[]) => unknown }
            const doc = await section.load(loader.load.bind(book))
            const txt = (doc.body?.textContent ?? '').replace(/\s+/g, ' ')
            section.unload()
            const ss = splitSentences(txt, lang)
            if (ss.length > 0) {
              meta.push(...ss.map((s) => ({ section: idx, start: s.start, end: s.end })))
              return ss.map((s) => s.text)
            }
          } catch {
            return null
          }
        }
      },
      onSentence: (i) => {
        const m = meta[i]
        if (!m) return
        void syncTtsSentence(m, i === 0 ? w.start : undefined)
      },
      onStop: clearTtsMark,
    })
    return true
  }

  async function syncTtsSentence(
    m: { section: number; start: number; end: number },
    overrideStart?: number,
  ) {
    const rend = rendRef.current
    if (!rend) return
    clearTtsMark()
    const contents = (rend.getContents() as unknown as Contents[])[0]
    if (!contents) return
    if (contents.sectionIndex !== m.section) {
      // La voz pasó al siguiente capítulo: avanzar la vista
      try {
        await rend.next()
      } catch {
        return
      }
      return
    }
    try {
      const map = new TextMap(contents.document.body)
      const range = map.rangeOf(overrideStart ?? m.start, m.end)
      if (!range) return
      // Avance de página si la oración quedó fuera de la vista
      const rect = range.getBoundingClientRect()
      const vw = contents.document.documentElement.clientWidth
      const vh = contents.document.documentElement.clientHeight
      if (rect.width + rect.height > 0) {
        if (rect.left >= vw - 4 || rect.right <= 4 || rect.top >= vh || rect.bottom <= 0) {
          await rend.next()
          eventsRef.current.onPageTurn()
        }
      }
      const cfi = (contents as unknown as { cfiFromRange: (r: Range) => string }).cfiFromRange(range)
      if (cfi) {
        rendRef.current?.annotations.highlight(
          cfi,
          { tts: true },
          undefined,
          'codex-tts',
          { fill: themeVars.accent, 'fill-opacity': '0.22' },
        )
        ttsCfi.current = cfi
      }
    } catch {
      /* resaltado best-effort: la lectura continúa */
    }
  }

  function clearTtsMark() {
    if (ttsCfi.current && rendRef.current) {
      try {
        rendRef.current.annotations.remove(ttsCfi.current, 'highlight')
      } catch {
        /* ignorar */
      }
      ttsCfi.current = null
    }
  }

  return <div className="epub-container" ref={hostRef} />
})

function chapterFor(book: EpubBook, sectionIndex: number): string | undefined {
  try {
    const spine = book.spine as unknown as { get: (i: number) => { href: string } | null }
    const href = spine.get(sectionIndex)?.href
    if (!href) return undefined
    const toc = (book.navigation?.toc ?? []) as { href: string; label: string }[]
    const item = toc.find((t) => t.href.split('#')[0].endsWith(href.split('#')[0]))
    return item?.label?.trim()
  } catch {
    return undefined
  }
}
