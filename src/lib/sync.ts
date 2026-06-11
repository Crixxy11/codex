// Export / import de la biblioteca completa como archivo .codex (zip).
// El import hace merge: nunca borra, resuelve conflictos por updatedAt.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { db } from '../db'
import type { Book, Highlight, KV, LogEvent, ReadingSession } from '../types'

interface Manifest {
  schema: 1
  exportedAt: string
  books: Book[]
  highlights: Highlight[]
  sessions: ReadingSession[]
  events: LogEvent[]
  kv: KV[]
  files: { bookId: string; name?: string; type: string }[]
  covers: { bookId: string; type: string; updatedAt: number }[]
}

export async function exportLibrary(): Promise<Blob> {
  const [books, highlights, sessions, events, kv, files, covers] = await Promise.all([
    db.books.toArray(),
    db.highlights.toArray(),
    db.sessions.toArray(),
    db.events.toArray(),
    db.kv.toArray(),
    db.files.toArray(),
    db.covers.toArray(),
  ])

  const manifest: Manifest = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    books,
    highlights,
    sessions,
    events,
    kv,
    files: files.map((f) => ({ bookId: f.bookId, name: f.name, type: f.blob.type })),
    covers: covers.map((c) => ({ bookId: c.bookId, type: c.blob.type, updatedAt: c.updatedAt })),
  }

  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
  }
  for (const f of files) {
    entries[`files/${f.bookId}`] = new Uint8Array(await f.blob.arrayBuffer())
  }
  for (const c of covers) {
    entries[`covers/${c.bookId}`] = new Uint8Array(await c.blob.arrayBuffer())
  }

  const zipped = zipSync(entries, { level: 6 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/octet-stream' })
}

export interface ImportResult {
  books: number
  highlights: number
  sessions: number
}

export async function importLibrary(file: File): Promise<ImportResult> {
  const data = new Uint8Array(await file.arrayBuffer())
  const entries = unzipSync(data)
  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) throw new Error('Archivo .codex inválido')
  const m = JSON.parse(strFromU8(manifestRaw)) as Manifest

  let booksMerged = 0
  let hlMerged = 0
  let sessMerged = 0

  await db.transaction(
    'rw',
    [db.books, db.highlights, db.sessions, db.events, db.files, db.covers],
    async () => {
      for (const b of m.books) {
        const existing = await db.books.get(b.id)
        if (!existing) {
          await db.books.put(b)
          booksMerged++
        } else if (b.updatedAt > existing.updatedAt) {
          // conservar el mayor progreso si el remoto va por detrás
          await db.books.put({ ...b, progress: Math.max(b.progress, existing.progress) })
          booksMerged++
        }
      }
      for (const h of m.highlights) {
        const existing = await db.highlights.get(h.id)
        if (!existing) {
          await db.highlights.put(h)
          hlMerged++
        } else if (h.updatedAt > existing.updatedAt) {
          await db.highlights.put(h)
        }
      }
      for (const s of m.sessions) {
        if (!(await db.sessions.get(s.id))) {
          await db.sessions.put(s)
          sessMerged++
        }
      }
      for (const e of m.events) {
        if (!(await db.events.get(e.id))) await db.events.put(e)
      }
      for (const f of m.files) {
        const bytes = entries[`files/${f.bookId}`]
        if (!bytes) continue
        if (!(await db.files.get(f.bookId))) {
          await db.files.put({
            bookId: f.bookId,
            blob: new Blob([bytes.buffer as ArrayBuffer], { type: f.type }),
            name: f.name,
          })
        }
      }
      for (const c of m.covers) {
        const bytes = entries[`covers/${c.bookId}`]
        if (!bytes) continue
        const existing = await db.covers.get(c.bookId)
        if (!existing || c.updatedAt > existing.updatedAt) {
          await db.covers.put({
            bookId: c.bookId,
            blob: new Blob([bytes.buffer as ArrayBuffer], { type: c.type }),
            updatedAt: c.updatedAt,
          })
        }
      }
    },
  )

  return { books: booksMerged, highlights: hlMerged, sessions: sessMerged }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
