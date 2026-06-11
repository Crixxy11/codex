// Arquitectura de TTS: el TtsController consume oraciones de una
// fuente (el lector activo) y delega la síntesis en un engine.
// Para añadir un proveedor externo (ElevenLabs, OpenAI, Google) solo
// hay que implementar TtsEngine y registrarlo en el catálogo.

export interface TtsVoiceInfo {
  /** 'system:<voiceURI>' o 'piper:<voiceId>' */
  id: string
  engine: 'system' | 'piper'
  name: string
  /** 'es', 'en', 'de', 'it'… */
  lang: string
  langLabel: string
  quality?: string
  /** Solo piper: si el modelo ya está descargado localmente. */
  downloaded?: boolean
  sizeMb?: number
  /** true si sigue sonando con la pantalla bloqueada. */
  lockScreenCapable: boolean
}

/**
 * Un engine sintetiza una oración. Dos modos:
 * - speak(): el engine reproduce él mismo (Web Speech API).
 * - synthesize(): devuelve audio que el controlador reproduce
 *   (necesario para pantalla bloqueada / MediaSession).
 */
export interface TtsEngine {
  kind: 'direct' | 'audio'
  /** Reproduce directamente. Resuelve al terminar la oración. */
  speak?(text: string, voiceId: string, rate: number, signal: AbortSignal): Promise<void>
  /** Sintetiza a Blob de audio (wav/mp3). */
  synthesize?(text: string, voiceId: string, signal: AbortSignal): Promise<Blob>
  pause?(): void
  resume?(): void
  stop(): void
}

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface TtsSourceChunk {
  /** Oraciones a leer, en orden. */
  sentences: string[]
  /** Metadatos para la pantalla de bloqueo. */
  title: string
  author: string
  artworkUrl?: string
}

export interface TtsCallbacks {
  /** Se invoca al empezar cada oración (índice dentro del chunk actual). */
  onSentence?: (index: number) => void
  /** Pedir el siguiente bloque (página/capítulo siguiente). null = fin. */
  onNeedMore?: () => Promise<string[] | null>
  onStatus?: (status: TtsStatus) => void
  onStop?: () => void
}
