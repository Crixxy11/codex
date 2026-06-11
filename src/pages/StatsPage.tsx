import { useEffect, useState } from 'react'
import { useSettings, useT } from '../stores/settings'
import { computeStats, exportDataset, type StatsBundle } from '../lib/stats'
import { fmtDuration } from '../lib/text'
import { SmoothArea, ActivityCalendar, HourClock, WeekdayPetals, Donut, Sparkline } from '../components/charts'
import { IconDownload } from '../components/Icons'

export default function StatsPage() {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const [stats, setStats] = useState<StatsBundle | null>(null)

  useEffect(() => {
    void computeStats().then(setStats)
  }, [])

  if (!stats) return <div className="page" />

  const empty = stats.sessionCount === 0
  const weekdays = lang === 'es' ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const nf = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US')

  const download = async () => {
    const blob = await exportDataset()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `codex-dataset-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <h1 className="page-title">{t('stats.title')}</h1>
      <p className="page-subtitle">{t('stats.subtitle')}</p>

      {empty ? (
        <div className="empty-state">
          <span className="ornament">⁂</span>
          <p>{t('stats.empty')}</p>
        </div>
      ) : (
        <>
          {/* fila héroe */}
          <div className="stat-hero">
            <div className="stat-card big">
              <div className="stat-label">{t('stats.totalTime')}</div>
              <div className="stat-value">{fmtDuration(stats.totalActiveMs, lang)}</div>
              <Sparkline values={stats.perDay30.map((d) => d.minutes)} width={130} />
            </div>
            <div className="stat-card big">
              <div className="stat-label">{t('stats.currentStreak')}</div>
              <div className="stat-value">
                {stats.currentStreak} <span className="stat-unit">{t('stats.days')}</span>
              </div>
              <div className="stat-sub">
                {t('stats.longestStreak')}: {stats.longestStreak} {t('stats.days')}
              </div>
            </div>
            <div className="stat-card big">
              <div className="stat-label">{t('stats.wpm')}</div>
              <div className="stat-value">{stats.wpm ? Math.round(stats.wpm) : '—'}</div>
              <div className="stat-sub">
                {nf.format(stats.wordsRead)} {lang === 'es' ? 'palabras' : 'words'}
              </div>
            </div>
          </div>

          {/* área 30 días */}
          <section className="stat-panel">
            <header>
              <h2>{t('stats.perDay')}</h2>
              <span className="stat-sub">
                {stats.weekMinutes} {t('stats.minutes')} {t('stats.thisWeek')}
              </span>
            </header>
            <SmoothArea data={stats.perDay30} />
          </section>

          {/* calendario */}
          <section className="stat-panel">
            <header>
              <h2>{t('stats.activity')}</h2>
              <span className="stat-sub">{t('stats.last12weeks')}</span>
            </header>
            <ActivityCalendar data={stats.calendar} />
          </section>

          <div className="stat-grid-2">
            <section className="stat-panel">
              <header><h2>{t('stats.byHour')}</h2></header>
              <HourClock values={stats.byHour} />
            </section>
            <section className="stat-panel">
              <header><h2>{t('stats.byWeekday')}</h2></header>
              <WeekdayPetals values={stats.byWeekday} labels={weekdays} />
              <div style={{ marginTop: 16 }}>
                <Donut fraction={stats.ttsShare} labelA={t('stats.listening')} labelB={t('stats.visual')} />
              </div>
            </section>
          </div>

          {/* mosaico de métricas */}
          <div className="stat-tiles">
            <Tile label={t('stats.sessions')} value={String(stats.sessionCount)} />
            <Tile label={t('stats.avgSession')} value={fmtDuration(stats.avgSessionMs, lang)} />
            <Tile label={t('stats.longestSession')} value={fmtDuration(stats.longestSessionMs, lang)} />
            <Tile label={t('stats.pagesRead')} value={nf.format(stats.pagesTurned)} />
            <Tile label={t('stats.daysActive')} value={String(stats.daysActive)} />
            <Tile label={t('stats.daysInactive')} value={String(stats.daysInactive)} />
            <Tile label={t('stats.booksStarted')} value={String(stats.booksStarted)} />
            <Tile label={t('stats.booksFinished')} value={String(stats.booksFinished)} />
            <Tile label={t('stats.booksAbandoned')} value={String(stats.booksAbandoned)} />
            <Tile
              label={t('stats.avgFinishTime')}
              value={stats.avgFinishDays ? `${Math.round(stats.avgFinishDays)} ${t('stats.days')}` : '—'}
            />
            <Tile label={t('stats.highlights')} value={String(stats.highlightCount)} />
            <Tile label={t('stats.notes')} value={String(stats.noteCount)} />
          </div>

          {/* autores y géneros */}
          {(stats.topAuthors.length > 0 || stats.topTags.length > 0) && (
            <div className="stat-grid-2">
              {stats.topAuthors.length > 0 && (
                <section className="stat-panel">
                  <header><h2>{t('stats.topAuthors')}</h2></header>
                  <RankList
                    items={stats.topAuthors.map((a) => ({
                      name: a.name,
                      detail: `${a.books} ${a.books === 1 ? t('common.book') : t('common.books')}`,
                      ms: a.ms,
                    }))}
                    lang={lang}
                  />
                </section>
              )}
              {stats.topTags.length > 0 && (
                <section className="stat-panel">
                  <header><h2>{t('stats.topTags')}</h2></header>
                  <RankList items={stats.topTags.map((g) => ({ name: g.name, detail: '', ms: g.ms }))} lang={lang} />
                </section>
              )}
            </div>
          )}

          <button className="btn" onClick={() => void download()} style={{ margin: '8px auto 0', display: 'flex' }}>
            <IconDownload width={18} height={18} /> {t('stats.export')}
          </button>
        </>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value sm">{value}</div>
    </div>
  )
}

function RankList({
  items,
  lang,
}: {
  items: { name: string; detail: string; ms: number }[]
  lang: 'es' | 'en'
}) {
  const max = Math.max(1, ...items.map((i) => i.ms))
  return (
    <div className="rank-list">
      {items.map((it) => (
        <div key={it.name} className="rank-row">
          <div className="rank-info">
            <span className="rank-name">{it.name}</span>
            <span className="rank-detail">
              {fmtDuration(it.ms, lang)}
              {it.detail ? ` · ${it.detail}` : ''}
            </span>
          </div>
          <div className="rank-bar">
            <div style={{ width: `${(it.ms / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
