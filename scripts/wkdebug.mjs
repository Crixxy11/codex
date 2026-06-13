import { webkit, devices } from 'playwright'

const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const result = await page.evaluate(async () => {
  const db = window.__codexDb
  const out = {}
  // 1) ¿put básico en books?
  try {
    await db.books.put({
      id: 'test-1',
      title: 'T',
      author: '',
      tags: [],
      format: 'text',
      status: 'want',
      favorite: false,
      progress: 0,
      flowMode: 'paginated',
      hasCustomCover: false,
      addedAt: 1,
      updatedAt: 1,
    })
    out.booksPut = 'ok'
  } catch (e) {
    out.booksPut = `${e.name}: ${e.message} | inner: ${e.inner?.name}: ${e.inner?.message}`
  }
  // 2) ¿put de Blob en files?
  try {
    await db.files.put({ bookId: 'test-1', blob: new Blob(['hola'], { type: 'text/plain' }) })
    out.filesPut = 'ok'
  } catch (e) {
    out.filesPut = `${e.name}: ${e.message} | inner: ${e.inner?.name}: ${e.inner?.message}`
  }
  // 3) ¿add en events (logEvent)?
  try {
    await db.events.add({ id: crypto.randomUUID(), ts: Date.now(), type: 'book_added' })
    out.eventsAdd = 'ok'
  } catch (e) {
    out.eventsAdd = `${e.name}: ${e.message} | inner: ${e.inner?.name}: ${e.inner?.message}`
  }
  out.uuid = typeof crypto.randomUUID
  return out
})
console.log(JSON.stringify(result, null, 2))
await browser.close()
