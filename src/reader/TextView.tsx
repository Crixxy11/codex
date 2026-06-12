import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Highlight, FlowMode } from '../types'
import type { ReaderEvents } from './types'
import { splitSentences, wordAt } from '../lib/text'

export interface ViewHandle {
  next: () => void
  prev: () => void
  /** Inicia el TTS desde el primer texto visible en pantalla. */
  speakFromTop: () => void
  /** Posición actual como anclaje (para notas sin selección). */
  currentAnchor: () => Promise<{
    anchor: import('../types').HighlightAnchor
    quote: string
    chapter?: string
  } | null>
}

interface Props {
  text: string
  bookId: string
  language?: string
  flowMode: FlowMode
  highlights: Highlight[]
  initialOffset: number
  events: ReaderEvents
}

interface Para {
  start: number
  end: number
  text: string
}

const TTS_BATCH = 120

export const TextView = forwardRef<ViewHandle, Props>(function TextView(
  { text, language, flowMode, highlights, initialOffset, events },
  ref,
) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pagerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const pageRef = useRef(0)
  const offsetRef = useRef(initialOffset)
  const sentences = useMemo(() => splitSentences(text, language ?? 'es'), [text, language])

  const paras = useMemo<Para[]>(() => {
    const out: Para[] = []
    const re = /[^\n]+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m[0].trim()) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
    }
    return out
  }, [text])

  // ---------- mapeo offsets globales ⇄ DOM ----------

  const paraEl = useCallback((i: number): HTMLElement | null => {
    return contentRef.current?.querySelector(`p[data-i="${i}"]`) ?? null
  }, [])

  const paraIndexAt = useCallback(
    (offset: number): number => {
      let lo = 0
      let hi = paras.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (paras[mid].end < offset) lo = mid + 1
        else hi = mid
      }
      return lo
    },
    [paras],
  )

  /** Range del documento para offsets globales (recortado a un párrafo). */
  const domRange = useCallback(
    (start: number, end: number): Range | null => {
      const pi = paraIndexAt(start)
      const p = paras[pi]
      if (!p) return null
      const el = paraEl(pi)
      if (!el) return null
      const localStart = Math.max(0, start - p.start)
      const localEnd = Math.min(p.text.length, end - p.start)
      const r = document.createRange()
      let acc = 0
      let setStart = false
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n: Node | null
      while ((n = walker.nextNode())) {
        const t = n as Text
        const len = t.data.length
        if (!setStart && localStart <= acc + len) {
          r.setStart(t, Math.max(0, localStart - acc))
          setStart = true
        }
        if (setStart && localEnd <= acc + len) {
          r.setEnd(t, Math.max(0, localEnd - acc))
          return r
        }
        acc += len
      }
      if (setStart) {
        r.setEnd(el, el.childNodes.length)
        return r
      }
      return null
    },
    [paras, paraIndexAt, paraEl],
  )

  /** Offset global de un punto del DOM dentro del contenido. */
  const globalOffset = useCallback(
    (node: Node, nodeOffset: number): number | null => {
      let el: HTMLElement | null =
        node.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as HTMLElement)
      while (el && el !== contentRef.current && !el.dataset?.i) el = el.parentElement
      if (!el || el === contentRef.current) return null
      const pi = Number(el.dataset.i)
      const p = paras[pi]
      if (!p) return null
      const r = document.createRange()
      r.setStart(el, 0)
      try {
        r.setEnd(node, nodeOffset)
      } catch {
        return p.start
      }
      return p.start + r.toString().length
    },
    [paras],
  )

  // ---------- paginación ----------

  // Con padding lateral de 32px y column-gap de 64px, el paso entre
  // páginas equivale exactamente al clientWidth del pager.
  const pageStep = useCallback((): number => {
    return pagerRef.current?.clientWidth || 1
  }, [])

  const applyPage = useCallback(
    (p: number) => {
      const el = pagerRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(p, Math.max(0, Math.ceil(el.scrollWidth / pageStep()) - 1)))
      pageRef.current = clamped
      setPage(clamped)
      el.style.transform = `translateX(${-clamped * pageStep()}px)`
    },
    [pageStep],
  )

  const pageOfOffset = useCallback(
    (offset: number): number => {
      const r = domRange(offset, Math.min(offset + 1, text.length))
      const rect = r?.getBoundingClientRect()
      if (!rect || !pagerRef.current) return 0
      const base = pagerRef.current.getBoundingClientRect().left + pageRef.current * pageStep()
      return Math.max(0, Math.round((rect.left - base) / pageStep()))
    },
    [domRange, pageStep, text.length],
  )

  const firstVisibleOffset = useCallback((): number => {
    if (flowMode === 'paginated') {
      const el = pagerRef.current
      if (!el) return offsetRef.current
      const rect = el.parentElement!.getBoundingClientRect()
      for (const dy of [0.18, 0.3, 0.45, 0.6]) {
        const r = document.caretRangeFromPoint?.(rect.left + 40, rect.top + rect.height * dy)
        if (r) {
          const off = globalOffset(r.startContainer, r.startOffset)
          if (off != null) return off
        }
      }
      return offsetRef.current
    }
    const sc = scrollerRef.current
    if (!sc) return offsetRef.current
    const rect = sc.getBoundingClientRect()
    for (const dy of [80, 140, 220]) {
      const r = document.caretRangeFromPoint?.(rect.left + rect.width / 2, rect.top + dy)
      if (r) {
        const off = globalOffset(r.startContainer, r.startOffset)
        if (off != null) return off
      }
    }
    return offsetRef.current
  }, [flowMode, globalOffset])

  const reportPosition = useCallback(() => {
    const off = firstVisibleOffset()
    offsetRef.current = off
    events.onProgress(text.length ? Math.min(1, off / text.length) : 0, { kind: 'text', offset: off })
  }, [firstVisibleOffset, events, text.length])

  // Layout inicial / cambio de modo: restaurar posición por offset.
  useLayoutEffect(() => {
    const off = offsetRef.current
    if (flowMode === 'paginated') {
      const el = pagerRef.current
      if (!el) return
      const recompute = () => {
        el.style.columnWidth = `${el.clientWidth - 64}px`
        setPageCount(Math.max(1, Math.ceil(el.scrollWidth / pageStep())))
        applyPage(0)
        applyPage(pageOfOffset(off))
      }
      recompute()
      const ro = new ResizeObserver(recompute)
      ro.observe(el.parentElement!)
      return () => ro.disconnect()
    } else {
      const r = domRange(off, off + 1)
      const rect = r?.getBoundingClientRect()
      const sc = scrollerRef.current
      if (rect && sc) sc.scrollTop += rect.top - sc.getBoundingClientRect().top - 90
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowMode])

  const go = useCallback(
    (dir: 1 | -1) => {
      if (flowMode === 'paginated') {
        applyPage(pageRef.current + dir)
        events.onPageTurn()
        setTimeout(reportPosition, 330) // esperar a la transición CSS
      } else {
        const sc = scrollerRef.current
        if (sc) sc.scrollBy({ top: dir * sc.clientHeight * 0.9, behavior: 'smooth' })
        events.onPageTurn()
        setTimeout(reportPosition, 400)
      }
    },
    [flowMode, applyPage, events, reportPosition],
  )

  useImperativeHandle(
    ref,
    () => ({
      next: () => go(1),
      prev: () => go(-1),
      speakFromTop: () => startTtsAt(firstVisibleOffset()),
      currentAnchor: async () => {
        const off = firstVisibleOffset()
        const quote = text.slice(off, off + 110).replace(/\s+\S*$/, '') + '…'
        return { anchor: { kind: 'text' as const, start: off, end: off }, quote }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [go, firstVisibleOffset, text],
  )

  // Scroll: reportar posición con debounce
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc || flowMode !== 'scrolled') return
    let t: ReturnType<typeof setTimeout>
    const onScroll = () => {
      events.onActivity()
      clearTimeout(t)
      t = setTimeout(reportPosition, 350)
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sc.removeEventListener('scroll', onScroll)
      clearTimeout(t)
    }
  }, [flowMode, reportPosition, events])

  // ---------- selección y tap ----------

  /** Lee la selección nativa y la emite si es válida. Devuelve true si había. */
  const emitSelection = useCallback((): boolean => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return false
    const start = globalOffset(range.startContainer, range.startOffset)
    const end = globalOffset(range.endContainer, range.endOffset)
    if (start == null || end == null || end <= start) return false
    events.onSelection({
      rect: range.getBoundingClientRect(),
      quote: text.slice(start, end),
      anchor: { kind: 'text', start, end },
      speak: () => startTtsAt(start),
    })
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, globalOffset, text])

  // Selección por long-press en táctil: el pointerup no basta en iOS,
  // así que escuchamos selectionchange con debounce.
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
      setTimeout(() => {
        if (emitSelection()) return
        events.onSelection(null)
        // Tap simple sobre una palabra → TTS desde ahí
        const target = e.target as HTMLElement
        if (target.closest('mark')) return
        const r = document.caretRangeFromPoint?.(e.clientX, e.clientY)
        const off = r ? globalOffset(r.startContainer, r.startOffset) : null
        const w = off != null ? wordAt(text, off) : null
        if (w) startTtsAt(w.start)
        else events.onBlankTap()
      }, 10)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, globalOffset, text],
  )

  // ---------- TTS ----------

  const ttsBatchEnd = useRef(0)

  const clearTtsOverlay = useCallback(() => {
    if (overlayRef.current) overlayRef.current.innerHTML = ''
  }, [])

  const showSentenceOverlay = useCallback(
    (start: number, end: number) => {
      clearTtsOverlay()
      const overlay = overlayRef.current
      const host = flowMode === 'paginated' ? pagerRef.current?.parentElement : scrollerRef.current
      if (!overlay || !host) return
      // Auto-avance si la oración no está visible
      const r = domRange(start, end)
      if (!r) return
      const rect = r.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
      if (flowMode === 'paginated') {
        if (rect.left > hostRect.right - 20 || rect.right < hostRect.left + 20) {
          applyPage(pageOfOffset(start))
          events.onPageTurn()
          setTimeout(reportPosition, 330)
        }
      } else {
        if (rect.top < hostRect.top + 50 || rect.bottom > hostRect.bottom - 60) {
          const sc = scrollerRef.current
          if (sc) sc.scrollTop += rect.top - hostRect.top - 110
          reportPosition()
        }
      }
      const r2 = domRange(start, end)
      if (!r2) return
      const oRect = overlay.getBoundingClientRect()
      for (const cr of r2.getClientRects()) {
        const d = document.createElement('div')
        d.className = 'tts-sentence-overlay'
        d.style.left = `${cr.left - oRect.left}px`
        d.style.top = `${cr.top - oRect.top}px`
        d.style.width = `${cr.width}px`
        d.style.height = `${cr.height}px`
        overlay.appendChild(d)
      }
    },
    [clearTtsOverlay, domRange, flowMode, applyPage, pageOfOffset, events, reportPosition],
  )

  const startTtsAt = useCallback(
    (offset: number) => {
      let si = sentences.findIndex((s) => offset >= s.start && offset < s.end)
      if (si < 0) si = sentences.findIndex((s) => s.start >= offset)
      if (si < 0) return
      const batchStart = si
      ttsBatchEnd.current = Math.min(sentences.length, si + TTS_BATCH)
      const firstSlice = sentences[si].text.slice(offset - sentences[si].start).trim()
      const batch = [
        firstSlice || sentences[si].text,
        ...sentences.slice(si + 1, ttsBatchEnd.current).map((s) => s.text),
      ]
      events.onWordTap({
        sentences: batch,
        startIndex: 0,
        more: async () => {
          if (ttsBatchEnd.current >= sentences.length) return null
          const from = ttsBatchEnd.current
          ttsBatchEnd.current = Math.min(sentences.length, from + TTS_BATCH)
          return sentences.slice(from, ttsBatchEnd.current).map((s) => s.text)
        },
        onSentence: (i) => {
          const s = sentences[batchStart + i]
          if (s) showSentenceOverlay(batchStart + i === si ? offset : s.start, s.end)
        },
        onStop: clearTtsOverlay,
      })
    },
    [sentences, events, showSentenceOverlay, clearTtsOverlay],
  )

  // ---------- render de párrafos con subrayados ----------

  const hlByPara = useMemo(() => {
    const map = new Map<number, { start: number; end: number; id: string }[]>()
    for (const h of highlights) {
      if (h.anchor.kind !== 'text') continue
      const a = h.anchor
      let pi = paraIndexAt(a.start)
      while (pi < paras.length && paras[pi].start < a.end) {
        const arr = map.get(pi) ?? []
        arr.push({ start: a.start, end: a.end, id: h.id })
        map.set(pi, arr)
        pi++
      }
    }
    return map
  }, [highlights, paras, paraIndexAt])

  const renderPara = (p: Para, i: number) => {
    const hls = (hlByPara.get(i) ?? []).slice().sort((a, b) => a.start - b.start)
    if (hls.length === 0)
      return (
        <p key={i} data-i={i}>
          {p.text}
        </p>
      )
    const parts: React.ReactNode[] = []
    let cur = p.start
    for (const h of hls) {
      const s = Math.max(p.start, h.start)
      const e = Math.min(p.end, h.end)
      if (s > cur) parts.push(text.slice(cur, s))
      parts.push(
        <mark
          key={`${h.id}-${s}`}
          data-hl-id={h.id}
          onClick={(ev) => {
            ev.stopPropagation()
            events.onHighlightTap(h.id, (ev.target as HTMLElement).getBoundingClientRect())
          }}
        >
          {text.slice(s, e)}
        </mark>,
      )
      cur = e
    }
    if (cur < p.end) parts.push(text.slice(cur, p.end))
    return (
      <p key={i} data-i={i}>
        {parts}
      </p>
    )
  }

  const body = (
    <div className="text-content" ref={contentRef}>
      {paras.map(renderPara)}
    </div>
  )

  if (flowMode === 'paginated') {
    return (
      <div className="text-reader paginated" onPointerUp={handlePointerUp}>
        <div className="text-pager-clip">
          <div className="text-pager" ref={pagerRef}>
            {body}
          </div>
        </div>
        <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <span style={{ display: 'none' }}>{page + 1}/{pageCount}</span>
      </div>
    )
  }

  return (
    <div className="text-reader" ref={scrollerRef} onPointerUp={handlePointerUp}>
      {body}
      <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  )
})
