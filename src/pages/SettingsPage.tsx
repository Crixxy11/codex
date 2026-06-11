import { useEffect, useRef, useState } from 'react'
import { useSettings, useT, THEMES } from '../stores/settings'
import { useToasts } from '../stores/toast'
import { listSystemVoices } from '../tts/system'
import { listPiperVoices, downloadPiperVoice, removePiperVoice } from '../tts/piper'
import type { TtsVoiceInfo } from '../tts/types'
import { exportLibrary, importLibrary, downloadBlob } from '../lib/sync'
import { IconCheck, IconDownload, IconUpload, IconTrash } from '../components/Icons'
import type { TKey } from '../i18n'

export default function SettingsPage() {
  const t = useT()
  const { theme, setTheme, lang, setLang, tts: ttsSettings, setTts } = useSettings()
  const show = useToasts((s) => s.show)
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([])
  const [voiceLang, setVoiceLang] = useState<string>('all')
  const [downloading, setDownloading] = useState<Record<string, number>>({})
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const refreshVoices = async () => {
    const [sys, piper] = await Promise.all([listSystemVoices(), listPiperVoices()])
    // primero las neuronales descargadas, luego catálogo, luego sistema
    setVoices([...piper.filter((v) => v.downloaded), ...piper.filter((v) => !v.downloaded), ...sys])
  }

  useEffect(() => {
    void refreshVoices()
  }, [])

  const langs = ['all', ...new Set(voices.map((v) => v.lang))]
  const filteredVoices = voiceLang === 'all' ? voices : voices.filter((v) => v.lang === voiceLang)

  const pickVoice = async (v: TtsVoiceInfo) => {
    if (v.engine === 'piper' && !v.downloaded) {
      setDownloading((d) => ({ ...d, [v.id]: 0 }))
      try {
        await downloadPiperVoice(v.id, (pct) => setDownloading((d) => ({ ...d, [v.id]: pct })))
        await refreshVoices()
        setTts({ voiceId: v.id, engine: 'piper' })
        show('✓')
      } catch (err) {
        console.error(err)
        show('Error')
      } finally {
        setDownloading((d) => {
          const { [v.id]: _, ...rest } = d
          void _
          return rest
        })
      }
      return
    }
    setTts({ voiceId: v.id, engine: v.engine })
  }

  return (
    <div className="page">
      <h1 className="page-title">{t('settings.title')}</h1>
      <p className="page-subtitle">{t('settings.about')}</p>

      {/* Apariencia */}
      <section className="settings-section">
        <h2>{t('settings.appearance')}</h2>
        <div className="settings-row">
          <span>{t('settings.theme')}</span>
          <div className="chip-row">
            {THEMES.map((th) => (
              <button key={th} className={`chip ${theme === th ? 'active' : ''}`} onClick={() => setTheme(th)}>
                {t(`theme.${th}` as TKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>{t('settings.language')}</span>
          <div className="segmented">
            <button className={lang === 'es' ? 'active' : ''} onClick={() => setLang('es')}>
              Español
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
        </div>
      </section>

      {/* Voces */}
      <section className="settings-section">
        <h2>{t('settings.voices')}</h2>
        <p className="settings-hint">{t('settings.voicesHint')}</p>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {langs.map((l) => (
            <button key={l} className={`chip ${voiceLang === l ? 'active' : ''}`} onClick={() => setVoiceLang(l)}>
              {l === 'all' ? '∗' : l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="voice-list">
          {filteredVoices.map((v) => {
            const active = ttsSettings.voiceId === v.id
            const dl = downloading[v.id]
            return (
              <div key={v.id} className={`voice-row ${active ? 'active' : ''}`}>
                <button className="voice-main" onClick={() => void pickVoice(v)}>
                  <span className="voice-name">
                    {v.name}
                    {active && <IconCheck width={15} height={15} style={{ color: 'var(--accent)' }} />}
                  </span>
                  <span className="voice-detail">
                    {v.langLabel}
                    {v.quality ? ` · ${v.quality}` : ''} ·{' '}
                    {v.engine === 'piper' ? t('tts.neural') : t('tts.system')}
                    {v.engine === 'piper' && !v.downloaded && dl == null ? ` · ${v.sizeMb} MB` : ''}
                  </span>
                </button>
                {dl != null && <span className="voice-dl">{dl}%</span>}
                {v.engine === 'piper' && !v.downloaded && dl == null && (
                  <IconDownload width={17} height={17} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                )}
                {v.engine === 'piper' && v.downloaded && (
                  <button
                    className="icon-btn"
                    style={{ width: 34, height: 34 }}
                    onClick={async () => {
                      await removePiperVoice(v.id)
                      if (ttsSettings.voiceId === v.id) setTts({ voiceId: undefined, engine: 'system' })
                      await refreshVoices()
                    }}
                    aria-label={t('common.delete')}
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <p className="settings-hint" style={{ marginTop: 10 }}>
          {t('tts.systemNote')}
        </p>
      </section>

      {/* Sincronización */}
      <section className="settings-section">
        <h2>{t('settings.sync')}</h2>
        <p className="settings-hint">{t('settings.syncHint')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const blob = await exportLibrary()
              downloadBlob(blob, `codex-${new Date().toISOString().slice(0, 10)}.codex`)
              show(t('settings.exportDone'))
            }}
          >
            <IconDownload width={17} height={17} /> {t('settings.export')}
          </button>
          <button className="btn" onClick={() => importRef.current?.click()} disabled={importing}>
            <IconUpload width={17} height={17} />{' '}
            {importing ? t('settings.importing') : t('settings.import')}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".codex,application/octet-stream,application/zip"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setImporting(true)
              try {
                const r = await importLibrary(f)
                show(`${t('settings.importDone')} · ${r.books} ${t('common.books')}`)
              } catch (err) {
                console.error(err)
                show('Error')
              } finally {
                setImporting(false)
              }
            }}
          />
        </div>
      </section>
    </div>
  )
}
