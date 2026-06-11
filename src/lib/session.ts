import { db, uid } from '../db'
import type { SessionMode } from '../types'

const HEARTBEAT_MS = 5000
const IDLE_LIMIT_MS = 60_000

/**
 * Rastrea una sesión de lectura: tiempo activo (descartando pausas),
 * tiempo con TTS, páginas pasadas y palabras leídas (por delta de
 * progreso × palabras del libro). Una instancia por lector abierto.
 */
export class SessionTracker {
  private bookId: string
  private startedAt = Date.now()
  private activeMs = 0
  private ttsMs = 0
  private pagesTurned = 0
  private lastActivity = Date.now()
  private lastBeat = Date.now()
  private ttsPlaying = false
  private startProgress: number
  private latestProgress: number
  private timer: ReturnType<typeof setInterval>
  private saved = false

  constructor(bookId: string, startProgress: number) {
    this.bookId = bookId
    this.startProgress = startProgress
    this.latestProgress = startProgress
    this.timer = setInterval(() => this.beat(), HEARTBEAT_MS)
  }

  private beat() {
    const now = Date.now()
    const delta = now - this.lastBeat
    this.lastBeat = now
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
    // El TTS cuenta como actividad aunque la pantalla esté bloqueada.
    if (this.ttsPlaying) {
      this.activeMs += delta
      this.ttsMs += delta
    } else if (visible && now - this.lastActivity < IDLE_LIMIT_MS) {
      this.activeMs += delta
    }
  }

  touch() {
    this.lastActivity = Date.now()
  }

  pageTurn() {
    this.pagesTurned++
    this.touch()
  }

  setTts(playing: boolean) {
    this.ttsPlaying = playing
    this.touch()
  }

  setProgress(p: number) {
    this.latestProgress = p
  }

  async stop(): Promise<void> {
    if (this.saved) return
    this.saved = true
    clearInterval(this.timer)
    this.beat()
    if (this.activeMs < 10_000) return // sesiones de <10 s no cuentan

    const book = await db.books.get(this.bookId)
    const words = Math.max(
      0,
      Math.round((this.latestProgress - this.startProgress) * (book?.wordCount ?? 0)),
    )
    const mode: SessionMode =
      this.ttsMs > this.activeMs * 0.85 ? 'tts' : this.ttsMs > this.activeMs * 0.15 ? 'mixed' : 'visual'

    await db.sessions.put({
      id: uid(),
      bookId: this.bookId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      activeMs: this.activeMs,
      ttsMs: this.ttsMs,
      wordsRead: words,
      pagesTurned: this.pagesTurned,
      startProgress: this.startProgress,
      endProgress: this.latestProgress,
      mode,
      updatedAt: Date.now(),
    })
  }
}
