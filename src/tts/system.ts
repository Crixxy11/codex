import type { TtsEngine, TtsVoiceInfo } from './types'

const LANG_LABELS: Record<string, string> = {
  es: 'Español',
  en: 'English',
  de: 'Deutsch',
  it: 'Italiano',
  fr: 'Français',
  pt: 'Português',
  ca: 'Català',
}

export function langLabel(code: string): string {
  return LANG_LABELS[code.slice(0, 2).toLowerCase()] ?? code
}

/** Espera a que speechSynthesis tenga voces (en Chrome llegan async). */
export function loadSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([])
    const have = speechSynthesis.getVoices()
    if (have.length > 0) return resolve(have)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(speechSynthesis.getVoices())
    }
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
    setTimeout(finish, 1500)
  })
}

export async function listSystemVoices(): Promise<TtsVoiceInfo[]> {
  const voices = await loadSystemVoices()
  return voices.map((v) => ({
    id: `system:${v.voiceURI}`,
    engine: 'system' as const,
    name: v.name,
    lang: v.lang.slice(0, 2).toLowerCase(),
    langLabel: langLabel(v.lang),
    lockScreenCapable: false,
  }))
}

/** Engine sobre la Web Speech API (voces del sistema, iOS/macOS incluidas). */
export class SystemEngine implements TtsEngine {
  kind = 'direct' as const

  async speak(text: string, voiceId: string, rate: number, signal: AbortSignal): Promise<void> {
    const voices = await loadSystemVoices()
    const uri = voiceId.replace(/^system:/, '')
    const voice = voices.find((v) => v.voiceURI === uri) ?? null
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      } else if (uri.startsWith('default:')) {
        // Voz por defecto del sistema, solo fijando el idioma
        u.lang = uri.slice('default:'.length)
      }
      u.rate = Math.min(2.5, Math.max(0.5, rate))
      u.onend = () => {
        resolve()
      }
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') resolve()
        else reject(new Error(e.error))
      }
      signal.addEventListener('abort', () => {
        speechSynthesis.cancel()
        resolve()
      })
      speechSynthesis.speak(u)
    })
  }

  pause(): void {
    speechSynthesis.pause()
  }

  resume(): void {
    speechSynthesis.resume()
  }

  stop(): void {
    speechSynthesis.cancel()
  }
}
