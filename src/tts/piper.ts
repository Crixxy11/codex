import * as piper from '@mintplex-labs/piper-tts-web'
import type { TtsEngine, TtsVoiceInfo } from './types'
import { langLabel } from './system'

// Catálogo curado: las mejores voces gratuitas de Piper por idioma.
// Los modelos se descargan una vez (OPFS) y funcionan offline.
const CATALOG: { id: string; name: string; lang: string; quality: string; sizeMb: number }[] = [
  // Español
  { id: 'es_ES-sharvard-medium', name: 'Sharvard (España)', lang: 'es', quality: 'media', sizeMb: 64 },
  { id: 'es_ES-davefx-medium', name: 'DaveFX (España)', lang: 'es', quality: 'media', sizeMb: 64 },
  { id: 'es_MX-claude-high', name: 'Claude (México)', lang: 'es', quality: 'alta', sizeMb: 64 },
  { id: 'es_MX-ald-medium', name: 'Ald (México)', lang: 'es', quality: 'media', sizeMb: 64 },
  // Inglés
  { id: 'en_US-lessac-medium', name: 'Lessac (US)', lang: 'en', quality: 'media', sizeMb: 64 },
  { id: 'en_US-ryan-high', name: 'Ryan (US)', lang: 'en', quality: 'alta', sizeMb: 115 },
  { id: 'en_US-hfc_female-medium', name: 'HFC Female (US)', lang: 'en', quality: 'media', sizeMb: 64 },
  { id: 'en_GB-cori-high', name: 'Cori (UK)', lang: 'en', quality: 'alta', sizeMb: 115 },
  { id: 'en_GB-alba-medium', name: 'Alba (UK)', lang: 'en', quality: 'media', sizeMb: 64 },
  // Alemán
  { id: 'de_DE-thorsten-high', name: 'Thorsten (DE)', lang: 'de', quality: 'alta', sizeMb: 115 },
  { id: 'de_DE-thorsten-medium', name: 'Thorsten (DE)', lang: 'de', quality: 'media', sizeMb: 64 },
  { id: 'de_DE-mls-medium', name: 'MLS (DE)', lang: 'de', quality: 'media', sizeMb: 64 },
  // Italiano (la única voz Piper disponible hoy)
  { id: 'it_IT-riccardo-x_low', name: 'Riccardo (IT)', lang: 'it', quality: 'básica', sizeMb: 20 },
  // Francés (bonus)
  { id: 'fr_FR-siwis-medium', name: 'Siwis (FR)', lang: 'fr', quality: 'media', sizeMb: 64 },
  { id: 'fr_FR-upmc-medium', name: 'UPMC (FR)', lang: 'fr', quality: 'media', sizeMb: 64 },
]

export async function listPiperVoices(): Promise<TtsVoiceInfo[]> {
  let storedIds: string[] = []
  try {
    storedIds = await piper.stored()
  } catch {
    /* OPFS no disponible: se mostrarán como no descargadas */
  }
  return CATALOG.map((v) => ({
    id: `piper:${v.id}`,
    engine: 'piper' as const,
    name: v.name,
    lang: v.lang,
    langLabel: langLabel(v.lang),
    quality: v.quality,
    downloaded: storedIds.includes(v.id),
    sizeMb: v.sizeMb,
    lockScreenCapable: true,
  }))
}

export async function downloadPiperVoice(
  voiceId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const id = voiceId.replace(/^piper:/, '')
  await piper.download(id, (p) => {
    if (p.total > 0) onProgress?.(Math.round((p.loaded / p.total) * 100))
  })
}

export async function removePiperVoice(voiceId: string): Promise<void> {
  await piper.remove(voiceId.replace(/^piper:/, ''))
}

// onnxruntime auto-alojado: debe coincidir con la versión JS empaquetada
// (el CDN por defecto del paquete apunta a una versión incompatible).
const WASM_PATHS = {
  onnxWasm: `${import.meta.env.BASE_URL}ort/`,
  piperData: piper.TtsSession.WASM_LOCATIONS.piperData,
  piperWasm: piper.TtsSession.WASM_LOCATIONS.piperWasm,
}

/** Engine neuronal Piper: sintetiza WAV reproducible con pantalla bloqueada. */
export class PiperEngine implements TtsEngine {
  kind = 'audio' as const
  private session: piper.TtsSession | null = null
  private sessionVoice = ''

  async synthesize(text: string, voiceId: string, signal: AbortSignal): Promise<Blob> {
    const id = voiceId.replace(/^piper:/, '')
    if (!this.session || this.sessionVoice !== id) {
      this.session = await piper.TtsSession.create({ voiceId: id, wasmPaths: WASM_PATHS })
      this.sessionVoice = id
    }
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    return this.session.predict(text)
  }

  stop(): void {
    /* la reproducción la gestiona el controlador */
  }
}
