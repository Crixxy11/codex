import type { HighlightAnchor, ReadingLocation } from '../types'

/** Selección activa de texto reportada por un lector. */
export interface SelectionInfo {
  /** Rect en coordenadas de la ventana principal. */
  rect: { left: number; top: number; right: number; bottom: number }
  quote: string
  anchor: HighlightAnchor
  chapter?: string
  /** Iniciar lectura en voz alta desde el inicio de la selección. */
  speak?: () => void
}

/** Petición de lectura en voz alta desde una palabra tocada. */
export interface TtsStartRequest {
  sentences: string[]
  startIndex: number
  /** Siguiente bloque de oraciones (página/capítulo siguiente), o null al final. */
  more: () => Promise<string[] | null>
  /** El lector sincroniza la vista con la oración i (resaltado / pasar página). */
  onSentence: (i: number) => void
  /** Limpiar resaltado de oración al parar. */
  onStop: () => void
}

export interface ReaderEvents {
  onProgress: (progress: number, location: ReadingLocation) => void
  onSelection: (sel: SelectionInfo | null) => void
  onWordTap: (req: TtsStartRequest) => void
  onPageTurn: () => void
  onActivity: () => void
  /** Tap en zona sin palabra: alternar visibilidad de la interfaz. */
  onBlankTap: () => void
  /** Tap sobre un subrayado existente (para borrarlo / ver nota). */
  onHighlightTap: (highlightId: string, rect: SelectionInfo['rect']) => void
}
