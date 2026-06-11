import { db } from '../db'
import { dayKey } from './text'
import type { Book, Highlight, ReadingSession } from '../types'

export interface StatsBundle {
  totalActiveMs: number
  ttsMs: number
  ttsShare: number
  sessionCount: number
  avgSessionMs: number
  longestSessionMs: number
  wordsRead: number
  pagesTurned: number
  wpm: number | null
  daysActive: number
  daysInactive: number
  currentStreak: number
  longestStreak: number
  booksStarted: number
  booksFinished: number
  booksAbandoned: number
  avgFinishDays: number | null
  highlightCount: number
  noteCount: number
  reviewCount: number
  /** minutos por día, últimos 30 días (viejo → nuevo) */
  perDay30: { day: string; minutes: number }[]
  /** minutos por día para el calendario (16 semanas) */
  calendar: Map<string, number>
  byHour: number[]
  byWeekday: number[]
  topAuthors: { name: string; ms: number; books: number }[]
  topTags: { name: string; ms: number }[]
  weekMinutes: number
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function computeStats(): Promise<StatsBundle> {
  const [sessions, books, highlights] = await Promise.all([
    db.sessions.toArray(),
    db.books.toArray(),
    db.highlights.toArray(),
  ])
  return buildStats(sessions, books, highlights)
}

export function buildStats(
  sessions: ReadingSession[],
  books: Book[],
  highlights: Highlight[],
): StatsBundle {
  const totalActiveMs = sessions.reduce((a, s) => a + s.activeMs, 0)
  const ttsMs = sessions.reduce((a, s) => a + s.ttsMs, 0)
  const wordsRead = sessions.reduce((a, s) => a + s.wordsRead, 0)
  const pagesTurned = sessions.reduce((a, s) => a + s.pagesTurned, 0)

  // WPM: mediana sobre sesiones visuales sustanciales
  const wpmSamples = sessions
    .filter((s) => s.mode !== 'tts' && s.wordsRead > 80 && s.activeMs - s.ttsMs > 3 * 60_000)
    .map((s) => s.wordsRead / ((s.activeMs - s.ttsMs) / 60_000))
    .filter((x) => x > 40 && x < 1500)
  const wpm = median(wpmSamples)

  // actividad por día
  const msPerDay = new Map<string, number>()
  for (const s of sessions) {
    const key = dayKey(s.startedAt)
    msPerDay.set(key, (msPerDay.get(key) ?? 0) + s.activeMs)
  }

  // rachas
  const activeDays = new Set(msPerDay.keys())
  const today = new Date()
  let currentStreak = 0
  for (let i = 0; ; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (activeDays.has(dayKey(d.getTime()))) currentStreak++
    else if (i === 0) continue // hoy aún sin leer no rompe la racha
    else break
  }
  let longestStreak = 0
  let run = 0
  if (activeDays.size > 0) {
    const sorted = [...activeDays].sort()
    let prev: Date | null = null
    for (const k of sorted) {
      const d = new Date(k + 'T12:00:00')
      if (prev && d.getTime() - prev.getTime() < 1.5 * 86400_000) run++
      else run = 1
      longestStreak = Math.max(longestStreak, run)
      prev = d
    }
  }

  const firstDay = sessions.length
    ? Math.min(...sessions.map((s) => s.startedAt))
    : Date.now()
  const totalDays = Math.max(1, Math.ceil((Date.now() - firstDay) / 86400_000))
  const daysActive = activeDays.size
  const daysInactive = Math.max(0, totalDays - daysActive)

  // últimos 30 días
  const perDay30: { day: string; minutes: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = dayKey(d.getTime())
    perDay30.push({ day: k, minutes: Math.round((msPerDay.get(k) ?? 0) / 60_000) })
  }
  const weekMinutes = perDay30.slice(-7).reduce((a, d) => a + d.minutes, 0)

  // calendario 16 semanas
  const calendar = new Map<string, number>()
  for (let i = 0; i < 16 * 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = dayKey(d.getTime())
    calendar.set(k, Math.round((msPerDay.get(k) ?? 0) / 60_000))
  }

  // distribución por hora y día de semana (ponderada por duración)
  const byHour = new Array(24).fill(0) as number[]
  const byWeekday = new Array(7).fill(0) as number[]
  for (const s of sessions) {
    // repartir activeMs a lo largo de [startedAt, endedAt] por horas
    const span = Math.max(1, s.endedAt - s.startedAt)
    let cursor = s.startedAt
    while (cursor < s.endedAt) {
      const d = new Date(cursor)
      const hourEnd = new Date(d)
      hourEnd.setMinutes(60, 0, 0)
      const sliceEnd = Math.min(hourEnd.getTime(), s.endedAt)
      const frac = (sliceEnd - cursor) / span
      byHour[d.getHours()] += s.activeMs * frac
      byWeekday[(d.getDay() + 6) % 7] += s.activeMs * frac // lunes = 0
      cursor = sliceEnd
    }
  }

  // libros
  const booksStarted = books.filter((b) => b.startedAt || b.progress > 0.001).length
  const finished = books.filter((b) => b.status === 'finished')
  const booksFinished = finished.length
  const booksAbandoned = books.filter((b) => b.status === 'abandoned').length
  const finishDurations = finished
    .filter((b) => b.startedAt && b.finishedAt && b.finishedAt > b.startedAt)
    .map((b) => (b.finishedAt! - b.startedAt!) / 86400_000)
  const avgFinishDays = finishDurations.length
    ? finishDurations.reduce((a, x) => a + x, 0) / finishDurations.length
    : null

  // autores y etiquetas por tiempo de lectura
  const bookMap = new Map(books.map((b) => [b.id, b]))
  const authorMs = new Map<string, { ms: number; books: Set<string> }>()
  const tagMs = new Map<string, number>()
  for (const s of sessions) {
    const b = bookMap.get(s.bookId)
    if (!b) continue
    if (b.author) {
      const e = authorMs.get(b.author) ?? { ms: 0, books: new Set<string>() }
      e.ms += s.activeMs
      e.books.add(b.id)
      authorMs.set(b.author, e)
    }
    for (const tag of b.tags) tagMs.set(tag, (tagMs.get(tag) ?? 0) + s.activeMs)
  }
  const topAuthors = [...authorMs.entries()]
    .map(([name, e]) => ({ name, ms: e.ms, books: e.books.size }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
  const topTags = [...tagMs.entries()]
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)

  const sessionCount = sessions.length

  return {
    totalActiveMs,
    ttsMs,
    ttsShare: totalActiveMs > 0 ? ttsMs / totalActiveMs : 0,
    sessionCount,
    avgSessionMs: sessionCount ? totalActiveMs / sessionCount : 0,
    longestSessionMs: sessions.reduce((a, s) => Math.max(a, s.activeMs), 0),
    wordsRead,
    pagesTurned,
    wpm,
    daysActive,
    daysInactive,
    currentStreak,
    longestStreak,
    booksStarted,
    booksFinished,
    booksAbandoned,
    avgFinishDays,
    highlightCount: highlights.length,
    noteCount: highlights.filter((h) => h.note && h.note.trim()).length,
    reviewCount: books.filter((b) => b.review && b.review.trim()).length,
    perDay30,
    calendar,
    byHour,
    byWeekday,
    topAuthors,
    topTags,
    weekMinutes,
  }
}

/** Exporta el dataset completo de lectura como JSON descargable. */
export async function exportDataset(): Promise<Blob> {
  const [books, highlights, sessions, events] = await Promise.all([
    db.books.toArray(),
    db.highlights.toArray(),
    db.sessions.toArray(),
    db.events.toArray(),
  ])
  const payload = {
    exportedAt: new Date().toISOString(),
    schema: 1,
    books: books.map(({ ...b }) => b),
    highlights,
    sessions,
    events,
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
