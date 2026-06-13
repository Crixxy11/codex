import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, binToBlob } from '../db'
import { coverDataUrl } from '../lib/covers'
import type { Book } from '../types'

/** Portada de un libro: blob subido/embebido o SVG procedural. */
export function CoverImage({ book, className }: { book: Book; className?: string }) {
  const cover = useLiveQuery(() => db.covers.get(book.id), [book.id])
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!cover) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(binToBlob(cover))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [cover])

  const src = url ?? coverDataUrl(book.title, book.author)
  return <img src={src} alt={book.title} className={className} loading="lazy" draggable={false} />
}
