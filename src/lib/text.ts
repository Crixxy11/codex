// Utilidades de texto: conteo de palabras, segmentación en oraciones
// y mapeo DOM ⇄ offsets de carácter (base del TTS y los subrayados).

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}’'-]+/gu)
  return m ? m.length : 0
}

export interface Sentence {
  text: string
  start: number
  end: number
}

/** Divide un texto en oraciones con sus offsets, vía Intl.Segmenter. */
export function splitSentences(text: string, lang = 'es'): Sentence[] {
  const out: Sentence[] = []
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(lang, { granularity: 'sentence' })
    for (const s of seg.segment(text)) {
      const t = s.segment
      if (t.trim().length > 0) out.push({ text: t, start: s.index, end: s.index + t.length })
    }
  } else {
    const re = /[^.!?…]+[.!?…]+["»”’)]*\s*|[^.!?…]+$/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m[0].trim()) out.push({ text: m[0], start: m.index, end: m.index + m[0].length })
    }
  }
  return out
}

/** Expande un offset al límite de la palabra que lo contiene. */
export function wordAt(text: string, offset: number): { start: number; end: number } | null {
  if (offset < 0 || offset >= text.length) return null
  const isWord = (c: string) => /[\p{L}\p{N}’'-]/u.test(c)
  if (!isWord(text[offset])) return null
  let start = offset
  let end = offset
  while (start > 0 && isWord(text[start - 1])) start--
  while (end < text.length && isWord(text[end])) end++
  return { start, end }
}

/**
 * Mapa entre el texto plano de un contenedor DOM y sus nodos de texto.
 * Permite: extraer texto, convertir offsets a Range y viceversa.
 */
export class TextMap {
  text = ''
  private nodes: { node: Text; start: number; end: number }[] = []

  constructor(root: Node) {
    const doc = root.ownerDocument ?? (root as Document)
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const parent = (n as Text).parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        const tag = parent.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    let pos = 0
    let n: Node | null
    while ((n = walker.nextNode())) {
      const t = n as Text
      const len = t.data.length
      if (len === 0) continue
      this.nodes.push({ node: t, start: pos, end: pos + len })
      pos += len
      this.text += t.data
    }
  }

  /** Offset global correspondiente a (nodo de texto, offset local). */
  offsetOf(node: Node, nodeOffset: number): number | null {
    for (const e of this.nodes) {
      if (e.node === node) return e.start + nodeOffset
    }
    // El nodo puede ser un elemento: usar su primer texto descendiente.
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      for (const e of this.nodes) {
        if (el.contains(e.node)) return e.start
      }
    }
    return null
  }

  /** Range del documento para un rango de offsets globales. */
  rangeOf(start: number, end: number): Range | null {
    const doc = this.nodes[0]?.node.ownerDocument
    if (!doc) return null
    let a: { node: Text; offset: number } | null = null
    let b: { node: Text; offset: number } | null = null
    for (const e of this.nodes) {
      if (!a && start >= e.start && start < e.end) a = { node: e.node, offset: start - e.start }
      if (end > e.start && end <= e.end) b = { node: e.node, offset: end - e.start }
    }
    if (!a || !b) return null
    const r = doc.createRange()
    r.setStart(a.node, a.offset)
    r.setEnd(b.node, b.offset)
    return r
  }
}

export function fmtDuration(ms: number, lang: 'es' | 'en' = 'es'): string {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} h` : `${h} h ${m} ${lang === 'es' ? 'min' : 'min'}`
}

export function fmtDate(ts: number, lang: 'es' | 'en' = 'es'): string {
  return new Date(ts).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
