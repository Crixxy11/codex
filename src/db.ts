import Dexie, { type Table } from 'dexie'
import type { Book, BookFile, Cover, Highlight, KV, LogEvent, ReadingSession } from './types'

export class CodexDB extends Dexie {
  books!: Table<Book, string>
  files!: Table<BookFile, string>
  covers!: Table<Cover, string>
  highlights!: Table<Highlight, string>
  sessions!: Table<ReadingSession, string>
  events!: Table<LogEvent, string>
  kv!: Table<KV, string>

  constructor() {
    super('codex')
    this.version(1).stores({
      books: 'id, title, author, status, updatedAt, lastReadAt',
      files: 'bookId',
      covers: 'bookId',
      highlights: 'id, bookId, createdAt, updatedAt',
      sessions: 'id, bookId, startedAt',
      events: 'id, ts, type, bookId',
      kv: 'key',
    })
  }
}

export const db = new CodexDB()

if (import.meta.env.DEV) {
  ;(window as unknown as { __codexDb: CodexDB }).__codexDb = db
}

export function uid(): string {
  return crypto.randomUUID()
}

/** Blob desde un registro binario (nuevo: data/type; legado: blob). */
export function binToBlob(rec: { data?: ArrayBuffer; type?: string; blob?: Blob }): Blob {
  if (rec.data) return new Blob([rec.data], { type: rec.type ?? 'application/octet-stream' })
  if (rec.blob) return rec.blob
  return new Blob([])
}

export async function logEvent(
  type: LogEvent['type'],
  bookId?: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db.events.add({ id: uid(), ts: Date.now(), type, bookId, data })
}
