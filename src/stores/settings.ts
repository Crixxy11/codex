import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, ThemeId } from '../types'
import { translate, type TKey } from '../i18n'

export const READING_FONTS = [
  { id: 'literata', label: 'Literata', css: "'Literata Variable', Georgia, serif" },
  { id: 'garamond', label: 'EB Garamond', css: "'EB Garamond', Georgia, serif" },
  { id: 'vollkorn', label: 'Vollkorn', css: "'Vollkorn', Georgia, serif" },
  { id: 'crimson', label: 'Crimson Pro', css: "'Crimson Pro', Georgia, serif" },
  { id: 'fraunces', label: 'Fraunces', css: "'Fraunces Variable', Georgia, serif" },
] as const

export const THEMES: ThemeId[] = ['marfil', 'pergamino', 'sepia', 'niebla', 'noche', 'tinta', 'bruma']

interface SettingsState extends AppSettings {
  setTheme: (t: ThemeId) => void
  setLang: (l: 'es' | 'en') => void
  setReader: (patch: Partial<AppSettings['reader']>) => void
  setTts: (patch: Partial<AppSettings['tts']>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'marfil',
      lang: 'es',
      reader: {
        fontFamily: 'literata',
        fontSize: 19,
        lineHeight: 1.62,
        measure: 66,
      },
      tts: { engine: 'system', rate: 1 },
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTts: (patch) => set((s) => ({ tts: { ...s.tts, ...patch } })),
    }),
    { name: 'codex-settings' },
  ),
)

/** Hook de traducción ligado al idioma activo. */
export function useT(): (key: TKey) => string {
  const lang = useSettings((s) => s.lang)
  return (key) => translate(lang, key)
}

export function fontCss(id: string): string {
  return READING_FONTS.find((f) => f.id === id)?.css ?? READING_FONTS[0].css
}
