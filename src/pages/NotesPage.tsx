import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useT } from '../stores/settings'
import { fmtDate } from '../lib/text'
import { IconSearch, IconQuote } from '../components/Icons'
import type { Book, Highlight } from '../types'

export default function NotesPage() {
  const t = useT()
  const [params] = useSearchParams()
  const bookFilter = params.get('book')
  const [mode, setMode] = useState<'book' | 'date'>('book')
  const [query, setQuery] = useState('')

  const highlights = useLiveQuery(() => db.highlights.toArray(), [], [] as Highlight[])
  const books = useLiveQuery(() => db.books.toArray(), [], [] as Book[])
  const bookMap = useMemo(() => new Map(books?.map((b) => [b.id, b])), [books])

  const filtered = useMemo(() => {
    let list = highlights ?? []
    if (bookFilter) list = list.filter((h) => h.bookId === bookFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (h) =>
          h.quote.toLowerCase().includes(q) ||
          h.note?.toLowerCase().includes(q) ||
          bookMap.get(h.bookId)?.title.toLowerCase().includes(q),
      )
    }
    return list
  }, [highlights, bookFilter, query, bookMap])

  const groups = useMemo(() => {
    if (mode === 'date') {
      const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt)
      const byDay = new Map<string, Highlight[]>()
      for (const h of sorted) {
        const key = fmtDate(h.createdAt)
        byDay.set(key, [...(byDay.get(key) ?? []), h])
      }
      return Array.from(byDay.entries()).map(([label, items]) => ({
        key: label,
        label,
        items,
        book: undefined as Book | undefined,
      }))
    }
    const byBook = new Map<string, Highlight[]>()
    for (const h of [...filtered].sort((a, b) => a.createdAt - b.createdAt)) {
      byBook.set(h.bookId, [...(byBook.get(h.bookId) ?? []), h])
    }
    return Array.from(byBook.entries())
      .map(([bookId, items]) => {
        const book = bookMap.get(bookId)
        return { key: bookId, label: book ? book.title : '—', items, book }
      })
      .sort((a, b) => (b.items.at(-1)?.createdAt ?? 0) - (a.items.at(-1)?.createdAt ?? 0))
  }, [filtered, mode, bookMap])

  return (
    <div className="page">
      <h1 className="page-title">{t('notes.title')}</h1>
      <p className="page-subtitle">{t('notes.subtitle')}</p>

      <div className="lib-toolbar">
        <div className="lib-search">
          <IconSearch />
          <input
            type="search"
            placeholder={t('notes.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button className={mode === 'book' ? 'active' : ''} onClick={() => setMode('book')}>
            {t('notes.byBook')}
          </button>
          <button className={mode === 'date' ? 'active' : ''} onClick={() => setMode('date')}>
            {t('notes.byDate')}
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="ornament">❝</span>
          <p>{t('notes.empty')}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="notes-group">
            <h2 className="notes-group-title">
              {g.label}
              {g.book?.author && <span className="notes-group-author"> · {g.book.author}</span>}
            </h2>
            {g.book?.review && (
              <div className="note-card review-card">
                <div className="note-label">{t('notes.review')}</div>
                <p className="note-text">{g.book.review}</p>
                {g.book.reviewDate && <div className="note-date">{fmtDate(g.book.reviewDate)}</div>}
              </div>
            )}
            {g.items.map((h) => (
              <article key={h.id} className="note-card">
                <IconQuote className="note-quote-icon" />
                <blockquote className="note-quote">{h.quote}</blockquote>
                {h.note && <p className="note-text">{h.note}</p>}
                <div className="note-date">
                  {mode === 'date' && bookMap.get(h.bookId) ? (
                    <span>{bookMap.get(h.bookId)!.title} · </span>
                  ) : null}
                  {h.chapter ? `${h.chapter} · ` : ''}
                  {fmtDate(h.createdAt)}
                </div>
              </article>
            ))}
          </section>
        ))
      )}
    </div>
  )
}
