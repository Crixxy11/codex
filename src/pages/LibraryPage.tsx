import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  addEpub,
  addPdf,
  addPastedText,
  deleteBook,
  setStatus,
  toggleFavorite,
  setCustomCover,
  saveReview,
} from '../lib/library'
import { useT } from '../stores/settings'
import { useToasts } from '../stores/toast'
import { CoverImage } from '../components/CoverImage'
import {
  IconPlus,
  IconHeart,
  IconSearch,
  IconBook,
  IconQuote,
  IconNote,
  IconImage,
  IconStar,
  IconTrash,
  IconDots,
  IconText,
  IconUpload,
} from '../components/Icons'
import type { Book, BookStatus } from '../types'
import { fmtDate } from '../lib/text'

type Filter = 'all' | 'favorites' | BookStatus

export default function LibraryPage() {
  const t = useT()
  const navigate = useNavigate()
  const show = useToasts((s) => s.show)
  const books = useLiveQuery(() => db.books.toArray(), [], [] as Book[])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ book: Book; x: number; y: number } | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [reviewFor, setReviewFor] = useState<Book | null>(null)
  const [statusFor, setStatusFor] = useState<Book | null>(null)
  const [deleteFor, setDeleteFor] = useState<Book | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const coverForRef = useRef<string | null>(null)

  const filtered = useMemo(() => {
    let list = books ?? []
    if (filter === 'favorites') list = list.filter((b) => b.favorite)
    else if (filter !== 'all') list = list.filter((b) => b.status === filter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt))
  }, [books, filter, query])

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return
      for (const f of Array.from(files)) {
        try {
          if (/\.epub$/i.test(f.name)) await addEpub(f)
          else if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') await addPdf(f)
          else continue
          show(`«${f.name.replace(/\.(epub|pdf)$/i, '')}» ✓`)
        } catch (err) {
          console.error(err)
          show(`Error: ${f.name}`)
        }
      }
    },
    [show],
  )

  const openMenu = useCallback((book: Book, x: number, y: number) => {
    setMenu({ book, x: Math.min(x, window.innerWidth - 250), y: Math.min(y, window.innerHeight - 420) })
  }, [])

  const statusLabel: Record<BookStatus, string> = {
    want: t('status.want'),
    reading: t('status.reading'),
    finished: t('status.finished'),
    abandoned: t('status.abandoned'),
  }

  return (
    <div className="page">
      <div className="lib-header">
        <div>
          <h1 className="page-title">{t('library.title')}</h1>
          <p className="page-subtitle">{t('library.subtitle')}</p>
        </div>
      </div>

      <div className="lib-toolbar">
        <div className="lib-search">
          <IconSearch />
          <input
            type="search"
            placeholder={t('library.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="chip-row">
          {(
            [
              ['all', t('library.all')],
              ['reading', t('status.reading')],
              ['favorites', t('library.favorites')],
              ['finished', t('status.finished')],
              ['want', t('status.want')],
              ['abandoned', t('status.abandoned')],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="ornament">❦</span>
          <p>{t('library.empty')}</p>
        </div>
      ) : (
        <div className="book-grid">
          {filtered.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              statusLabel={statusLabel[b.status]}
              onOpen={() => navigate(`/read/${b.id}`)}
              onMenu={(x, y) => openMenu(b, x, y)}
            />
          ))}
        </div>
      )}

      <button className="add-fab" onClick={() => setAddOpen(true)} aria-label={t('library.add')}>
        <IconPlus width={26} height={26} />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".epub,.pdf,application/pdf,application/epub+zip"
        multiple
        hidden
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={coverRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f && coverForRef.current) {
            await setCustomCover(coverForRef.current, f)
            show('✓')
          }
          e.target.value = ''
        }}
      />

      {addOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="modal">
            <h3>{t('library.add')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', padding: '16px 20px' }}
                onClick={() => {
                  setAddOpen(false)
                  fileRef.current?.click()
                }}
              >
                <IconUpload /> {t('library.addFile')}
              </button>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', padding: '16px 20px' }}
                onClick={() => {
                  setAddOpen(false)
                  setPasteOpen(true)
                }}
              >
                <IconText /> {t('library.pasteText')}
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          book={menu.book}
          x={menu.x}
          y={menu.y}
          labels={{
            continue: t('library.continue'),
            notes: t('library.viewNotes'),
            review: menu.book.review ? t('library.editReview') : t('library.writeReview'),
            cover: t('library.changeCover'),
            status: t('library.changeStatus'),
            del: t('library.delete'),
            fav: t('library.favorites'),
          }}
          onClose={() => setMenu(null)}
          onAction={(action) => {
            const b = menu.book
            setMenu(null)
            if (action === 'continue') navigate(`/read/${b.id}`)
            else if (action === 'notes') navigate(`/notes?book=${b.id}`)
            else if (action === 'review') setReviewFor(b)
            else if (action === 'cover') {
              coverForRef.current = b.id
              coverRef.current?.click()
            } else if (action === 'status') setStatusFor(b)
            else if (action === 'fav') void toggleFavorite(b.id)
            else if (action === 'del') setDeleteFor(b)
          }}
        />
      )}

      {pasteOpen && (
        <PasteModal
          onClose={() => setPasteOpen(false)}
          onSave={async (title, author, text) => {
            await addPastedText(title, author, text)
            setPasteOpen(false)
            show(`«${title}» ✓`)
          }}
        />
      )}

      {reviewFor && (
        <ReviewModal
          book={reviewFor}
          onClose={() => setReviewFor(null)}
          onSave={async (text) => {
            await saveReview(reviewFor.id, text)
            setReviewFor(null)
            show('✓')
          }}
        />
      )}

      {statusFor && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setStatusFor(null)}>
          <div className="modal">
            <h3>{t('library.changeStatus')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['want', 'reading', 'finished', 'abandoned'] as BookStatus[]).map((s) => (
                <button
                  key={s}
                  className={`btn ${statusFor.status === s ? 'btn-accent' : ''}`}
                  style={{ justifyContent: 'flex-start' }}
                  onClick={async () => {
                    await setStatus(statusFor.id, s)
                    setStatusFor(null)
                  }}
                >
                  {statusLabel[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteFor && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDeleteFor(null)}>
          <div className="modal">
            <h3>{deleteFor.title}</h3>
            <p style={{ color: 'var(--ink-soft)', marginBottom: 18 }}>{t('library.deleteConfirm')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteFor(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await deleteBook(deleteFor.id)
                  setDeleteFor(null)
                }}
              >
                {t('library.deleteYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- tarjeta de libro ----------

function BookCard({
  book,
  statusLabel,
  onOpen,
  onMenu,
}: {
  book: Book
  statusLabel: string
  onOpen: () => void
  onMenu: (x: number, y: number) => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressed = useRef(false)

  return (
    <div
      className="book-card"
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        longPressed.current = false
        const { clientX, clientY } = e
        pressTimer.current = setTimeout(() => {
          longPressed.current = true
          if (navigator.vibrate) navigator.vibrate(8)
          onMenu(clientX, clientY)
        }, 460)
      }}
      onPointerUp={() => clearTimeout(pressTimer.current)}
      onPointerMove={() => clearTimeout(pressTimer.current)}
      onPointerLeave={() => clearTimeout(pressTimer.current)}
      onClick={() => {
        if (!longPressed.current) onOpen()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="book-cover">
        <CoverImage book={book} />
        {book.favorite && (
          <span className="fav-badge">
            <IconHeart filled />
          </span>
        )}
        {book.progress > 0.001 && book.status !== 'finished' && (
          <div className="book-progress">
            <div style={{ width: `${Math.round(book.progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="book-meta">
        <div className="bt">{book.title}</div>
        {book.author && <div className="ba">{book.author}</div>}
        <span className="bs">
          {statusLabel}
          {book.progress > 0.001 && book.status === 'reading'
            ? ` · ${Math.round(book.progress * 100)}%`
            : ''}
        </span>
      </div>
      <button
        className="icon-btn"
        style={{ position: 'absolute', top: 2, left: 2, width: 34, height: 34, color: 'transparent' }}
        onClick={(e) => {
          e.stopPropagation()
          onMenu(e.clientX, e.clientY)
        }}
        aria-label="menu"
      >
        <IconDots style={{ color: 'var(--ink)', opacity: 0.0 }} />
      </button>
    </div>
  )
}

// ---------- menú contextual ----------

function ContextMenu({
  book,
  x,
  y,
  labels,
  onAction,
  onClose,
}: {
  book: Book
  x: number
  y: number
  labels: Record<'continue' | 'notes' | 'review' | 'cover' | 'status' | 'del' | 'fav', string>
  onAction: (a: 'continue' | 'notes' | 'review' | 'cover' | 'status' | 'del' | 'fav') => void
  onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 315 }} onPointerDown={onClose} />
      <div className="ctx-menu" style={{ left: x, top: y }}>
        <button onClick={() => onAction('continue')}>
          <IconBook /> {labels.continue}
        </button>
        <button onClick={() => onAction('notes')}>
          <IconQuote /> {labels.notes}
        </button>
        <button onClick={() => onAction('review')}>
          <IconNote /> {labels.review}
        </button>
        <div className="sep" />
        <button onClick={() => onAction('fav')}>
          <IconHeart filled={book.favorite} /> {book.favorite ? '♥' : ''} {labels.fav}
        </button>
        <button onClick={() => onAction('cover')}>
          <IconImage /> {labels.cover}
        </button>
        <button onClick={() => onAction('status')}>
          <IconStar /> {labels.status}
        </button>
        <div className="sep" />
        <button className="danger" onClick={() => onAction('del')}>
          <IconTrash /> {labels.del}
        </button>
      </div>
    </>
  )
}

// ---------- pegar texto ----------

function PasteModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (title: string, author: string, text: string) => void
}) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{t('paste.title')}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>{t('paste.titleField')}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>{t('paste.authorField')}</label>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('paste.textField')}</label>
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!title.trim() || !text.trim()}
              style={{ opacity: !title.trim() || !text.trim() ? 0.5 : 1 }}
              onClick={() => onSave(title, author, text)}
            >
              {t('paste.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- reseña ----------

function ReviewModal({
  book,
  onClose,
  onSave,
}: {
  book: Book
  onClose: () => void
  onSave: (text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(book.review ?? '')
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>
          {t('review.title')} — {book.title}
        </h3>
        {book.reviewDate && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginBottom: 10 }}>
            {t('review.written')} {fmtDate(book.reviewDate)}
          </p>
        )}
        <div className="field">
          <textarea
            rows={8}
            placeholder={t('review.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(text)}>
            {t('review.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
