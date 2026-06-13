// ============================================================
// Codex — Domain types
// Todo lleva `updatedAt` para permitir merge sin pérdida al
// sincronizar entre dispositivos (last-write-wins por entidad).
// ============================================================

export type BookFormat = 'epub' | 'pdf' | 'text'

export type BookStatus = 'want' | 'reading' | 'finished' | 'abandoned'

export type FlowMode = 'paginated' | 'scrolled'

/** Posición de lectura, específica por formato. */
export type ReadingLocation =
  | { kind: 'epub'; cfi: string }
  | { kind: 'pdf'; page: number; scrollY?: number }
  | { kind: 'text'; offset: number }

/** Anclaje de un subrayado, específico por formato. */
export type HighlightAnchor =
  | { kind: 'epub'; cfi: string; sectionIndex?: number }
  | { kind: 'pdf'; page: number; start: number; end: number }
  | { kind: 'text'; start: number; end: number }

export interface Book {
  id: string
  title: string
  author: string
  language?: string
  /** Géneros/categorías que el usuario asigna libremente. */
  tags: string[]
  format: BookFormat
  status: BookStatus
  favorite: boolean
  /** 0..1 */
  progress: number
  wordCount?: number
  location?: ReadingLocation
  flowMode: FlowMode
  /** true si el usuario subió portada propia (blob en tabla covers). */
  hasCustomCover: boolean
  review?: string
  reviewDate?: number
  addedAt: number
  startedAt?: number
  finishedAt?: number
  lastReadAt?: number
  updatedAt: number
}

/**
 * Binarios como ArrayBuffer, NUNCA como Blob: Safari/WebKit falla al
 * clonar Blobs hacia IndexedDB ("Error preparing Blob/File data").
 * `blob` queda solo como campo legado de datos antiguos (Chromium).
 */
export interface BookFile {
  bookId: string
  /** EPUB/PDF binario, o texto plano (UTF-8) para format 'text'. */
  data?: ArrayBuffer
  type?: string
  name?: string
  /** legado */
  blob?: Blob
}

export interface Cover {
  bookId: string
  data?: ArrayBuffer
  type?: string
  updatedAt: number
  /** legado */
  blob?: Blob
}

export interface Highlight {
  id: string
  bookId: string
  quote: string
  note?: string
  anchor: HighlightAnchor
  /** Capítulo o contexto legible, si se conoce. */
  chapter?: string
  createdAt: number
  updatedAt: number
}

export type SessionMode = 'visual' | 'tts' | 'mixed'

export interface ReadingSession {
  id: string
  bookId: string
  startedAt: number
  endedAt: number
  /** Tiempo realmente activo (sin pausas largas), ms. */
  activeMs: number
  /** Parte del tiempo activo con TTS sonando, ms. */
  ttsMs: number
  wordsRead: number
  pagesTurned: number
  startProgress: number
  endProgress: number
  mode: SessionMode
  updatedAt: number
}

/**
 * Registro append-only de eventos. Es el dataset crudo del que
 * se derivan estadísticas y, en el futuro, el mapa intelectual.
 */
export interface LogEvent {
  id: string
  ts: number
  type:
    | 'book_added'
    | 'book_opened'
    | 'book_finished'
    | 'book_abandoned'
    | 'book_deleted'
    | 'status_changed'
    | 'page_turn'
    | 'highlight_created'
    | 'highlight_deleted'
    | 'note_added'
    | 'review_written'
    | 'tts_started'
    | 'tts_stopped'
    | 'cover_changed'
  bookId?: string
  data?: Record<string, unknown>
}

export interface KV {
  key: string
  value: unknown
  updatedAt: number
}

// ---------- Ajustes ----------

export type ThemeId = 'marfil' | 'pergamino' | 'sepia' | 'niebla' | 'noche' | 'tinta' | 'bruma'

export interface ReaderSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  /** Anchura de la medida de texto, en ch aprox (45–95). */
  measure: number
}

export interface AppSettings {
  theme: ThemeId
  lang: 'es' | 'en'
  reader: ReaderSettings
  tts: {
    voiceId?: string
    engine: 'system' | 'piper'
    rate: number
  }
}
