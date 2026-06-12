import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Highlight, FlowMode } from '../types'
import type { ReaderEvents } from './types'
import type { PdfDocument } from '../lib/pdf'
import { splitSentences, wordAt } from '../lib/text'
import type { ViewHandle } from './TextView'

interface Props {
  pdf: PdfDocument
  bookId: string
  language?: string
  flowMode: FlowMode
  highlights: Highlight[]
  initialPage: number
  events: ReaderEvents
}

interface PageText {
  text: string
  /** offset inicial de cada item dentro del texto de la página */
  starts: number[]
  items: { str: string; transform: number[]; width: number }[]
}

const pageTextCache = new WeakMap<PdfDocument, Map<number, PageText>>()

async function getPageText(pdf: PdfDocument, pageNum: number): Promise<PageText> {
  let cache = pageTextCache.get(pdf)
  if (!cache) {
    cache = new Map()
    pageTextCache.set(pdf, cache)
  }
  const hit = cache.get(pageNum)
  if (hit) return hit
  const page = await pdf.getPage(pageNum)
  const tc = await page.getTextContent()
  let text = ''
  const starts: number[] = []
  const items: PageText['items'] = []
  for (const it of tc.items) {
    if (!('str' in it)) continue
    starts.push(text.length)
    items.push({ str: it.str, transform: it.transform, width: it.width })
    text += it.str
    text += it.hasEOL ? '\n' : ' '
  }
  const result = { text, starts, items }
  cache.set(pageNum, result)
  return result
}

export const PdfView = forwardRef<ViewHandle, Props>(function PdfView(
  { pdf, language, flowMode, highlights, initialPage, events },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(Math.max(1, Math.min(initialPage, pdf.numPages)))
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage
  const [ttsRange, setTtsRange] = useState<{ page: number; start: number; end: number } | null>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  // Rango de páginas montadas con render activo (modo scroll). Se calcula
  // desde la posición de scroll — sin IntersectionObserver, que no
  // dispara en pestañas ocultas y es poco fiable entre navegadores.
  const [activeRange, setActiveRange] = useState<{ from: number; to: number }>({
    from: Math.max(1, initialPage - 2),
    to: initialPage + 3,
  })

  const computeActiveRange = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const margin = 1600
    const top = host.scrollTop - margin
    const bottom = host.scrollTop + host.clientHeight + margin
    let from = Number.MAX_SAFE_INTEGER
    let to = 0
    for (const [num, el] of pageRefs.current) {
      const y = el.offsetTop
      if (y + el.offsetHeight >= top && y <= bottom) {
        from = Math.min(from, num)
        to = Math.max(to, num)
      }
    }
    if (to >= from) {
      setActiveRange((r) => (r.from === from && r.to === to ? r : { from, to }))
    }
  }, [])

  const pages = useMemo(() => Array.from({ length: pdf.numPages }, (_, i) => i + 1), [pdf.numPages])

  const report = useCallback(
    (page: number) => {
      events.onProgress(page / pdf.numPages, { kind: 'pdf', page })
    },
    [events, pdf.numPages],
  )

  useEffect(() => {
    report(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, pdf.numPages))
      if (flowMode === 'paginated') {
        setCurrentPage(p)
        report(p)
      } else {
        pageRefs.current.get(p)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setCurrentPage(p)
        report(p)
      }
      events.onPageTurn()
    },
    [pdf.numPages, flowMode, report, events],
  )

  useImperativeHandle(
    ref,
    () => ({
      next: () => {
        if (flowMode === 'paginated') goToPage(currentPageRef.current + 1)
        else hostRef.current?.scrollBy({ top: hostRef.current.clientHeight * 0.9, behavior: 'smooth' })
      },
      prev: () => {
        if (flowMode === 'paginated') goToPage(currentPageRef.current - 1)
        else hostRef.current?.scrollBy({ top: -hostRef.current.clientHeight * 0.9, behavior: 'smooth' })
      },
    }),
    [flowMode, goToPage],
  )

  // En modo scroll: restaurar posición inicial y activar el rango visible
  useEffect(() => {
    if (flowMode !== 'scrolled') return
    const id = setTimeout(() => {
      const el = pageRefs.current.get(currentPageRef.current)
      if (el && currentPageRef.current > 1) el.scrollIntoView({ block: 'start' })
      computeActiveRange()
    }, 80)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowMode])

  // En modo scroll: detectar página visible para progreso
  useEffect(() => {
    if (flowMode !== 'scrolled') return
    const host = hostRef.current
    if (!host) return
    let t: ReturnType<typeof setTimeout>
    const onScroll = () => {
      events.onActivity()
      clearTimeout(t)
      t = setTimeout(() => {
        computeActiveRange()
        const hostTop = host.getBoundingClientRect().top
        // Última página cuyo borde superior ya cruzó la línea de lectura
        // (robusto aunque el punto caiga en el hueco entre páginas).
        let best = 1
        for (const [num, el] of pageRefs.current) {
          if (el.getBoundingClientRect().top <= hostTop + 150) best = Math.max(best, num)
        }
        currentPageRef.current = best
        setCurrentPage(best)
        report(best)
      }, 300)
    }
    host.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      host.removeEventListener('scroll', onScroll)
      clearTimeout(t)
    }
  }, [flowMode, events, report, computeActiveRange])

  // Recalcular el rango activo al cambiar el zoom (cambian las alturas)
  useEffect(() => {
    if (flowMode !== 'scrolled') return
    const id = setTimeout(computeActiveRange, 300)
    return () => clearTimeout(id)
  }, [zoom, flowMode, computeActiveRange])

  // ---------- zoom (botones, ctrl+rueda, pinch) ----------

  const applyZoom = useCallback((f: (z: number) => number) => {
    setZoom((z) => Math.min(4, Math.max(0.5, f(z))))
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      applyZoom((z) => z * (e.deltaY < 0 ? 1.1 : 0.9))
    }
    let pinchDist = 0
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist > 0) {
        e.preventDefault()
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        if (Math.abs(d - pinchDist) > 24) {
          applyZoom((z) => z * (d > pinchDist ? 1.08 : 0.92))
          pinchDist = d
        }
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('touchstart', onTouchStart, { passive: true })
    host.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
    }
  }, [applyZoom])

  // ---------- selección y tap palabra ----------

  const offsetFromPoint = useCallback(
    async (x: number, y: number): Promise<{ page: number; offset: number } | null> => {
      // Intento preciso por caret (puede fallar con spans escalados)
      const r = document.caretRangeFromPoint?.(x, y)
      let span = (r?.startContainer.parentElement ?? (r?.startContainer as HTMLElement | undefined))
        ?.closest?.('span[data-start]') as HTMLElement | null
      let local =
        span && r && r.startContainer.nodeType === Node.TEXT_NODE ? r.startOffset : null
      if (!span) {
        // Fallback: elemento bajo el punto + offset proporcional a la x
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        span = (el?.closest?.('span[data-start]') as HTMLElement | null) ?? null
        local = null
      }
      if (!span) return null
      const pageEl = span.closest('[data-page]') as HTMLElement | null
      if (!pageEl) return null
      if (local == null) {
        const rect = span.getBoundingClientRect()
        const len = span.textContent?.length ?? 0
        local = rect.width > 0 ? Math.floor(((x - rect.left) / rect.width) * len) : 0
        local = Math.max(0, Math.min(len - 1, local))
      }
      return { page: Number(pageEl.dataset.page), offset: Number(span.dataset.start) + local }
    },
    [],
  )

  const selectionInfo = useCallback((): {
    page: number
    start: number
    end: number
    rect: DOMRect
    quote: string
  } | null => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const findPos = (node: Node, off: number) => {
      const span = (node.parentElement ?? (node as HTMLElement))?.closest?.('span[data-start]') as
        | HTMLElement
        | null
      if (!span) return null
      const pageEl = span.closest('[data-page]') as HTMLElement | null
      if (!pageEl) return null
      return { page: Number(pageEl.dataset.page), offset: Number(span.dataset.start) + off }
    }
    const a = findPos(range.startContainer, range.startOffset)
    const b = findPos(range.endContainer, range.endOffset)
    if (!a || !b || a.page !== b.page || b.offset <= a.offset) return null
    return {
      page: a.page,
      start: a.offset,
      end: b.offset,
      rect: range.getBoundingClientRect(),
      quote: sel.toString(),
    }
  }, [])

  // ---------- TTS desde palabra ----------

  const startTtsAt = useCallback(
    async (page: number, offset: number) => {
      const pt = await getPageText(pdf, page)
      const sentences = splitSentences(pt.text, language ?? 'es')
      let si = sentences.findIndex((s) => offset >= s.start && offset < s.end)
      if (si < 0) si = 0
      const w = wordAt(pt.text, offset)
      const fromOffset = w ? w.start : sentences[si].start
      const localSentences = sentences.slice(si)
      const meta: { page: number; start: number; end: number }[] = localSentences.map((s) => ({
        page,
        start: s.start,
        end: s.end,
      }))
      const texts = localSentences.map((s, i) =>
        i === 0 ? s.text.slice(fromOffset - s.start).trim() || s.text : s.text,
      )
      let nextPage = page + 1
      events.onWordTap({
        sentences: texts,
        startIndex: 0,
        more: async () => {
          while (nextPage <= pdf.numPages) {
            const np = await getPageText(pdf, nextPage)
            const ss = splitSentences(np.text, language ?? 'es')
            const p = nextPage
            nextPage++
            if (ss.length > 0) {
              meta.push(...ss.map((s) => ({ page: p, start: s.start, end: s.end })))
              return ss.map((s) => s.text)
            }
          }
          return null
        },
        onSentence: (i) => {
          const m = meta[i]
          if (!m) return
          if (m.page !== currentPageRef.current) goToPage(m.page)
          setTtsRange(m)
        },
        onStop: () => setTtsRange(null),
      })
    },
    [pdf, language, events, goToPage],
  )

  const emitSelection = useCallback((): boolean => {
    const sel = selectionInfo()
    if (!sel) return false
    events.onSelection({
      rect: sel.rect,
      quote: sel.quote,
      anchor: { kind: 'pdf', page: sel.page, start: sel.start, end: sel.end },
      chapter: `p. ${sel.page}`,
      speak: () => void startTtsAt(sel.page, sel.start),
    })
    return true
  }, [selectionInfo, events, startTtsAt])

  // Selección por long-press en iOS: selectionchange con debounce.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onChange = () => {
      clearTimeout(t)
      t = setTimeout(() => void emitSelection(), 450)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      clearTimeout(t)
    }
  }, [emitSelection])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      events.onActivity()
      setTimeout(async () => {
        if (emitSelection()) return
        events.onSelection(null)
        if ((e.target as HTMLElement).closest('.pdf-hl-rect, .pdf-zoom-controls')) return
        const pos = await offsetFromPoint(e.clientX, e.clientY)
        if (pos) void startTtsAt(pos.page, pos.offset)
        else events.onBlankTap()
      }, 10)
    },
    [events, emitSelection, offsetFromPoint, startTtsAt],
  )

  // ---------- render ----------

  const visiblePages = flowMode === 'paginated' ? [currentPage] : pages

  return (
    <div
      className="pdf-scroll"
      ref={hostRef}
      onPointerUp={handlePointerUp}
      style={flowMode === 'paginated' ? { overflowY: 'hidden' } : undefined}
    >
      {visiblePages.map((p) => (
        <PdfPage
          key={p}
          pdf={pdf}
          pageNum={p}
          zoom={zoom}
          lazy={flowMode === 'scrolled'}
          active={flowMode !== 'scrolled' || (p >= activeRange.from && p <= activeRange.to)}
          highlights={highlights.filter((h) => h.anchor.kind === 'pdf' && h.anchor.page === p)}
          ttsRange={ttsRange?.page === p ? ttsRange : null}
          events={events}
          refCb={(el) => {
            if (el) pageRefs.current.set(p, el)
            else pageRefs.current.delete(p)
          }}
        />
      ))}
      <div className="pdf-zoom-controls glass">
        <button className="icon-btn" onClick={() => applyZoom((z) => z * 1.2)} aria-label="Zoom +">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button className="icon-btn" onClick={() => setZoom(1)} aria-label="Zoom 100%" style={{ fontSize: 11 }}>
          1:1
        </button>
        <button className="icon-btn" onClick={() => applyZoom((z) => z * 0.83)} aria-label="Zoom −">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14"/></svg>
        </button>
      </div>
    </div>
  )
})

// ============================================================
// Página individual: canvas + capa de texto + capas de subrayado
// ============================================================

interface PageProps {
  pdf: PdfDocument
  pageNum: number
  zoom: number
  lazy: boolean
  /** Renderizar solo dentro del rango activo (reciclaje de memoria). */
  active: boolean
  highlights: Highlight[]
  ttsRange: { start: number; end: number } | null
  events: ReaderEvents
  refCb: (el: HTMLDivElement | null) => void
}

function PdfPage({ pdf, pageNum, zoom, lazy, active, highlights, ttsRange, events, refCb }: PageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const hlRef = useRef<HTMLDivElement>(null)
  const visible = active
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [textReady, setTextReady] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const renderTask = useRef<{ cancel: () => void } | null>(null)

  // Reciclaje: al salir del rango activo, soltar la memoria del canvas.
  // iOS Safari tiene un presupuesto de canvas limitado y al excederlo
  // deja los lienzos en blanco sin avisar — esto evita las "hojas
  // blancas" en libros largos.
  useEffect(() => {
    if (visible) return
    renderTask.current?.cancel()
    const canvas = canvasRef.current
    if (canvas && canvas.width > 0) {
      canvas.width = 0
      canvas.height = 0
    }
    if (textRef.current) textRef.current.innerHTML = ''
    if (hlRef.current) hlRef.current.innerHTML = ''
  }, [visible])

  // Render del canvas + capa de texto
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    ;(async () => {
      try {
        await renderPage()
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== 'RenderingCancelledException') {
          console.error(`[pdf] página ${pageNum}:`, err)
          setRenderError(String((err as Error)?.message ?? err))
        }
      }
    })()

    async function renderPage() {
      setRenderError(null)
      const page = await pdf.getPage(pageNum)
      const container = wrapRef.current?.parentElement
      if (!container || cancelled) return
      const availW = Math.min(container.clientWidth - 16, 980)
      const base = page.getViewport({ scale: 1 })
      // En paginado la página completa debe caber en pantalla (contain);
      // en scroll basta con ajustar al ancho.
      const availH = container.clientHeight - 24
      const fit = lazy ? availW / base.width : Math.min(availW / base.width, availH / base.height)
      const scale = fit * zoom
      const vp = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.floor(vp.width * dpr)
      canvas.height = Math.floor(vp.height * dpr)
      canvas.style.width = `${vp.width}px`
      canvas.style.height = `${vp.height}px`
      setSize({ w: vp.width, h: vp.height })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      renderTask.current?.cancel()
      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      })
      renderTask.current = task
      try {
        await task.promise
      } catch (err) {
        if ((err as Error)?.name === 'RenderingCancelledException') return
        throw err
      }
      if (cancelled) return

      // Capa de texto
      const textLayer = textRef.current
      if (!textLayer) return
      textLayer.innerHTML = ''
      const pt = await getPageText(pdf, pageNum)
      if (cancelled) return
      const frag = document.createDocumentFragment()
      const spans: { el: HTMLSpanElement; expected: number }[] = []
      pt.items.forEach((item, idx) => {
        if (!item.str) return
        const tx = item.transform
        // Transformación PDF → viewport (Util.transform inlined)
        const m = vp.transform
        const a = m[0] * tx[0] + m[2] * tx[1]
        const b = m[1] * tx[0] + m[3] * tx[1]
        const e = m[0] * tx[4] + m[2] * tx[5] + m[4]
        const f = m[1] * tx[4] + m[3] * tx[5] + m[5]
        const fontHeight = Math.hypot(a, b)
        const span = document.createElement('span')
        span.textContent = item.str
        span.dataset.start = String(pt.starts[idx])
        span.style.left = `${e}px`
        span.style.top = `${f - fontHeight}px`
        span.style.fontSize = `${fontHeight}px`
        span.style.fontFamily = 'sans-serif'
        frag.appendChild(span)
        spans.push({ el: span, expected: item.width * scale })
      })
      textLayer.appendChild(frag)
      // Ajustar el ancho de cada span al del texto real del PDF
      for (const { el, expected } of spans) {
        const w = el.offsetWidth
        if (w > 0 && expected > 0) el.style.transform = `scaleX(${expected / w})`
      }
      setTextReady((n) => n + 1)
    }
    return () => {
      cancelled = true
    }
  }, [visible, pdf, pageNum, zoom])

  // Subrayados + oración TTS como rects superpuestos
  useEffect(() => {
    const layer = hlRef.current
    const textLayer = textRef.current
    const wrap = wrapRef.current
    if (!layer || !textLayer || !wrap || !textReady) return
    layer.innerHTML = ''
    const wrapRect = wrap.getBoundingClientRect()

    const rectsFor = (start: number, end: number): DOMRect[] => {
      const out: DOMRect[] = []
      for (const span of textLayer.querySelectorAll<HTMLElement>('span[data-start]')) {
        const s0 = Number(span.dataset.start)
        const tnode = span.firstChild as Text | null
        if (!tnode) continue
        const len = tnode.data.length
        const s = Math.max(start, s0)
        const e = Math.min(end, s0 + len)
        if (e <= s) continue
        const r = document.createRange()
        r.setStart(tnode, s - s0)
        r.setEnd(tnode, e - s0)
        out.push(...Array.from(r.getClientRects()))
      }
      return out
    }

    for (const h of highlights) {
      if (h.anchor.kind !== 'pdf') continue
      for (const cr of rectsFor(h.anchor.start, h.anchor.end)) {
        const d = document.createElement('div')
        d.className = 'pdf-hl-rect'
        d.style.left = `${cr.left - wrapRect.left}px`
        d.style.top = `${cr.top - wrapRect.top}px`
        d.style.width = `${cr.width}px`
        d.style.height = `${cr.height}px`
        d.onclick = (ev) => {
          ev.stopPropagation()
          events.onHighlightTap(h.id, d.getBoundingClientRect())
        }
        layer.appendChild(d)
      }
    }
    if (ttsRange) {
      for (const cr of rectsFor(ttsRange.start, ttsRange.end)) {
        const d = document.createElement('div')
        d.className = 'pdf-tts-rect'
        d.style.left = `${cr.left - wrapRect.left}px`
        d.style.top = `${cr.top - wrapRect.top}px`
        d.style.width = `${cr.width}px`
        d.style.height = `${cr.height}px`
        layer.appendChild(d)
      }
    }
  }, [highlights, ttsRange, textReady, events])

  return (
    <div
      className="pdf-page-wrap"
      data-page={pageNum}
      ref={(el) => {
        wrapRef.current = el
        refCb(el)
      }}
      style={size ? { width: size.w, height: size.h } : { width: '85%', aspectRatio: '0.707', maxWidth: 980, margin: '0 auto 18px' }}
    >
      <canvas ref={canvasRef} />
      <div className="pdf-text-layer" ref={textRef} />
      <div className="pdf-hl-layer" ref={hlRef} />
      {renderError && (
        <div className="pdf-page-error">
          No se pudo renderizar la página {pageNum}: {renderError}
        </div>
      )}
    </div>
  )
}
