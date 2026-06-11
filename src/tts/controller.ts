import { create } from 'zustand'
import type { TtsCallbacks, TtsSourceChunk, TtsStatus } from './types'
import { SystemEngine } from './system'
import { PiperEngine } from './piper'

interface TtsUiState {
  status: TtsStatus
  bookId: string | null
  rate: number
  sentence: string
}

export const useTtsState = create<TtsUiState>(() => ({
  status: 'idle',
  bookId: null,
  rate: 1,
  sentence: '',
}))

const PREFETCH_AHEAD = 2

/**
 * Controlador único de reproducción. Mantiene la cola de oraciones,
 * pide más al agotarse (auto-avance de página), sincroniza MediaSession
 * y delega la síntesis en el engine de la voz elegida.
 */
class TtsController {
  private system = new SystemEngine()
  private piper = new PiperEngine()
  private audio: HTMLAudioElement | null = null

  private sentences: string[] = []
  private index = 0
  private voiceId = ''
  private rate = 1
  private abort: AbortController | null = null
  private callbacks: TtsCallbacks = {}
  private cache = new Map<number, Promise<Blob>>()
  private status: TtsStatus = 'idle'
  private exhausted = false
  private generation = 0

  get isAudioEngine(): boolean {
    return this.voiceId.startsWith('piper:')
  }

  private setStatus(s: TtsStatus) {
    this.status = s
    useTtsState.setState({ status: s })
    this.callbacks.onStatus?.(s)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState =
        s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'none'
    }
  }

  async start(
    chunk: TtsSourceChunk,
    startIndex: number,
    voiceId: string,
    rate: number,
    callbacks: TtsCallbacks,
    bookId: string,
  ): Promise<void> {
    this.stop()
    this.generation++
    const gen = this.generation
    this.sentences = [...chunk.sentences]
    this.index = Math.max(0, Math.min(startIndex, this.sentences.length - 1))
    this.voiceId = voiceId
    this.rate = rate
    this.callbacks = callbacks
    this.cache.clear()
    this.exhausted = false
    this.abort = new AbortController()
    useTtsState.setState({ bookId, rate })

    if (this.isAudioEngine && !this.audio) {
      // Crear el elemento de audio dentro del gesto del usuario (iOS).
      this.audio = new Audio()
      this.audio.preload = 'auto'
      this.audio.preservesPitch = true
    }

    this.setupMediaSession(chunk)
    this.setStatus('loading')
    void this.runLoop(gen)
  }

  private setupMediaSession(chunk: TtsSourceChunk) {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chunk.title,
      artist: chunk.author,
      album: 'Codex',
      artwork: chunk.artworkUrl
        ? [{ src: chunk.artworkUrl, sizes: '512x512', type: 'image/png' }]
        : [],
    })
    navigator.mediaSession.setActionHandler('play', () => this.resume())
    navigator.mediaSession.setActionHandler('pause', () => this.pause())
    navigator.mediaSession.setActionHandler('stop', () => this.stop())
    navigator.mediaSession.setActionHandler('nexttrack', () => this.skip(1))
    navigator.mediaSession.setActionHandler('previoustrack', () => this.skip(-1))
  }

  private async ensureMore(): Promise<boolean> {
    if (this.index < this.sentences.length) return true
    if (this.exhausted) return false
    const more = await this.callbacks.onNeedMore?.()
    if (more && more.length > 0) {
      this.sentences.push(...more)
      return this.index < this.sentences.length
    }
    this.exhausted = true
    return false
  }

  private prefetch(gen: number) {
    if (!this.isAudioEngine || !this.abort) return
    for (let i = this.index; i < Math.min(this.index + PREFETCH_AHEAD + 1, this.sentences.length); i++) {
      if (!this.cache.has(i) && gen === this.generation) {
        const text = this.sentences[i]
        this.cache.set(
          i,
          this.piper.synthesize(text, this.voiceId, this.abort.signal),
        )
      }
    }
    // Liberar lo ya reproducido
    for (const k of this.cache.keys()) if (k < this.index - 1) this.cache.delete(k)
  }

  private async runLoop(gen: number): Promise<void> {
    try {
      while (gen === this.generation && this.abort && !this.abort.signal.aborted) {
        const has = await this.ensureMore()
        if (!has || gen !== this.generation) break
        const i = this.index
        const text = this.sentences[i]
        useTtsState.setState({ sentence: text })
        this.callbacks.onSentence?.(i)

        if (this.isAudioEngine) {
          this.prefetch(gen)
          const blobPromise = this.cache.get(i) ?? this.piper.synthesize(text, this.voiceId, this.abort.signal)
          this.cache.set(i, blobPromise)
          const blob = await blobPromise
          if (gen !== this.generation || this.abort.signal.aborted) break
          if (this.status !== 'paused') this.setStatus('playing')
          await this.playBlob(blob, gen)
        } else {
          this.setStatus('playing')
          await this.system.speak(text, this.voiceId, this.rate, this.abort.signal)
        }

        if (gen !== this.generation || this.abort?.signal.aborted) break
        // Si skip() ya movió el índice, no avanzar de nuevo.
        if (this.index === i) this.index = i + 1
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('[tts]', err)
    }
    if (gen === this.generation) {
      this.setStatus('idle')
      this.callbacks.onStop?.()
    }
  }

  private playBlob(blob: Blob, gen: number): Promise<void> {
    return new Promise((resolve) => {
      const audio = this.audio
      if (!audio || gen !== this.generation) return resolve()
      const url = URL.createObjectURL(blob)
      audio.src = url
      audio.playbackRate = this.rate
      const cleanup = () => {
        URL.revokeObjectURL(url)
        audio.onended = null
        audio.onerror = null
        resolve()
      }
      audio.onended = cleanup
      audio.onerror = cleanup
      const onAbort = () => {
        audio.pause()
        cleanup()
      }
      this.abort?.signal.addEventListener('abort', onAbort, { once: true })
      void audio.play().catch(cleanup)
    })
  }

  pause(): void {
    if (this.status !== 'playing') return
    if (this.isAudioEngine) this.audio?.pause()
    else this.system.pause()
    this.setStatus('paused')
  }

  resume(): void {
    if (this.status !== 'paused') return
    if (this.isAudioEngine) void this.audio?.play()
    else this.system.resume()
    this.setStatus('playing')
  }

  toggle(): void {
    if (this.status === 'playing') this.pause()
    else if (this.status === 'paused') this.resume()
  }

  /** Salta n oraciones (±1). Reinicia la reproducción en el nuevo índice. */
  skip(n: number): void {
    if (this.status === 'idle') return
    const target = Math.max(0, this.index + n)
    this.restartAt(target)
  }

  private restartAt(index: number): void {
    const gen = ++this.generation
    const prevAbort = this.abort
    this.abort = new AbortController()
    prevAbort?.abort()
    if (!this.isAudioEngine) this.system.stop()
    this.audio?.pause()
    this.index = index
    this.setStatus('loading')
    void this.runLoop(gen)
  }

  setRate(rate: number): void {
    this.rate = Math.min(2.5, Math.max(0.5, rate))
    useTtsState.setState({ rate: this.rate })
    if (this.isAudioEngine && this.audio) {
      this.audio.playbackRate = this.rate
    } else if (this.status === 'playing') {
      // La Web Speech API no permite cambiar rate en caliente:
      // reiniciar la oración actual con la nueva velocidad.
      this.restartAt(this.index)
    }
  }

  stop(): void {
    this.generation++
    this.abort?.abort()
    this.abort = null
    this.system.stop()
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
    }
    this.cache.clear()
    if (this.status !== 'idle') {
      this.setStatus('idle')
      this.callbacks.onStop?.()
    }
    useTtsState.setState({ bookId: null, sentence: '' })
  }
}

export const tts = new TtsController()
