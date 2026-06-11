import ePub from 'epubjs'
import { db, uid, logEvent } from '../db'
import type { Book, BookStatus } from '../types'
import { countWords } from './text'
import { getDocumentSafe } from './pdf'

function baseBook(partial: Partial<Book> & Pick<Book, 'title' | 'author' | 'format'>): Book {
  const now = Date.now()
  return {
    id: uid(),
    language: undefined,
    tags: [],
    status: 'want',
    favorite: false,
    progress: 0,
    flowMode: 'paginated',
    hasCustomCover: false,
    addedAt: now,
    updatedAt: now,
    ...partial,
  }
}

export async function addEpub(file: File): Promise<Book> {
  const buf = await file.arrayBuffer()
  const book = ePub(buf)
  await book.loaded.metadata
  const meta = book.packaging.metadata
  const record = baseBook({
    title: meta.title || file.name.replace(/\.epub$/i, ''),
    author: meta.creator || '',
    language: meta.language || undefined,
    format: 'epub',
  })
  await db.files.put({ bookId: record.id, blob: new Blob([buf]), name: file.name })

  // Portada embebida del EPUB, si existe
  try {
    const coverUrl = await book.coverUrl()
    if (coverUrl) {
      const blob = await (await fetch(coverUrl)).blob()
      await db.covers.put({ bookId: record.id, blob, updatedAt: Date.now() })
    }
  } catch {
    /* sin portada embebida */
  }

  await db.books.put(record)
  await logEvent('book_added', record.id, { format: 'epub' })

  // Conteo de palabras en segundo plano (no bloquea la importación)
  void countEpubWords(book, record.id)
  return record
}

async function countEpubWords(book: ReturnType<typeof ePub>, bookId: string) {
  try {
    await book.loaded.spine
    let words = 0
    const items: { load: (l: unknown) => Promise<Document>; unload: () => void }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(book.spine as any).each((s: any) => items.push(s))
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (await item.load((book as any).load.bind(book))) as Document
      words += countWords(doc.body?.textContent ?? '')
      item.unload()
    }
    await db.books.update(bookId, { wordCount: words })
  } catch {
    /* el conteo es best-effort */
  }
}

export async function addPdf(file: File): Promise<Book> {
  const buf = await file.arrayBuffer()
  const pdf = await getDocumentSafe(buf.slice(0))
  let title = file.name.replace(/\.pdf$/i, '')
  let author = ''
  try {
    const meta = await pdf.getMetadata()
    const info = meta.info as Record<string, string> | undefined
    if (info?.Title && info.Title.trim()) title = info.Title.trim()
    if (info?.Author) author = info.Author.trim()
  } catch {
    /* metadatos opcionales */
  }
  const record = baseBook({ title, author, format: 'pdf' })
  await db.files.put({ bookId: record.id, blob: new Blob([buf], { type: 'application/pdf' }), name: file.name })
  await db.books.put(record)
  await logEvent('book_added', record.id, { format: 'pdf', pages: pdf.numPages })

  void countPdfWords(pdf, record.id)
  return record
}

async function countPdfWords(pdf: Awaited<ReturnType<typeof getDocumentSafe>>, bookId: string) {
  try {
    let words = 0
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      const text = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ')
      words += countWords(text)
    }
    await db.books.update(bookId, { wordCount: words })
  } catch {
    /* best-effort */
  }
}

export async function addPastedText(title: string, author: string, text: string): Promise<Book> {
  const record = baseBook({
    title: title.trim() || 'Sin título',
    author: author.trim(),
    format: 'text',
    wordCount: countWords(text),
  })
  await db.files.put({ bookId: record.id, blob: new Blob([text], { type: 'text/plain' }) })
  await db.books.put(record)
  await logEvent('book_added', record.id, { format: 'text' })
  return record
}

export async function deleteBook(bookId: string): Promise<void> {
  await Promise.all([
    db.books.delete(bookId),
    db.files.delete(bookId),
    db.covers.delete(bookId),
    db.highlights.where('bookId').equals(bookId).delete(),
  ])
  await logEvent('book_deleted', bookId)
}

export async function setStatus(bookId: string, status: BookStatus): Promise<void> {
  const patch: Partial<Book> = { status, updatedAt: Date.now() }
  if (status === 'finished') patch.finishedAt = Date.now()
  if (status === 'reading') patch.startedAt = (await db.books.get(bookId))?.startedAt ?? Date.now()
  await db.books.update(bookId, patch)
  await logEvent('status_changed', bookId, { status })
  if (status === 'abandoned') await logEvent('book_abandoned', bookId)
}

export async function toggleFavorite(bookId: string): Promise<void> {
  const b = await db.books.get(bookId)
  if (b) await db.books.update(bookId, { favorite: !b.favorite, updatedAt: Date.now() })
}

export async function setCustomCover(bookId: string, file: File): Promise<void> {
  await db.covers.put({ bookId, blob: file, updatedAt: Date.now() })
  await db.books.update(bookId, { hasCustomCover: true, updatedAt: Date.now() })
  await logEvent('cover_changed', bookId)
}

export async function saveReview(bookId: string, review: string): Promise<void> {
  await db.books.update(bookId, { review, reviewDate: Date.now(), updatedAt: Date.now() })
  await logEvent('review_written', bookId)
}

/**
 * Actualiza progreso y posición. Devuelve true si el libro acaba de
 * cruzar el 90% y se marcó como Leído (para la celebración en UI).
 */
export async function updateProgress(
  bookId: string,
  progress: number,
  location: Book['location'],
): Promise<boolean> {
  const b = await db.books.get(bookId)
  if (!b) return false
  const patch: Partial<Book> = {
    progress,
    location,
    lastReadAt: Date.now(),
    updatedAt: Date.now(),
  }
  if (b.status === 'want' || (!b.startedAt && progress > 0.001)) {
    patch.status = b.status === 'finished' ? b.status : 'reading'
    patch.startedAt = b.startedAt ?? Date.now()
  }
  let justFinished = false
  if (progress >= 0.9 && b.status !== 'finished') {
    patch.status = 'finished'
    patch.finishedAt = Date.now()
    justFinished = true
  }
  await db.books.update(bookId, patch)
  if (justFinished) await logEvent('book_finished', bookId)
  return justFinished
}
