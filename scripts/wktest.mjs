// Reproducción en WebKit (motor de Safari/iPhone) del flujo completo:
// importar EPUB → abrir → scroll/página → play TTS. Reporta errores.
import { webkit, devices } from 'playwright'

const BASE = 'http://localhost:5173/'
const EPUB = '/Users/crixcanales/Documents/books/El jugador (Dostoyevski, Fiodor M) (z-library.sk, 1lib.sk, z-lib.sk).epub'

const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()

const logs = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${(e.stack || '').slice(0, 500)}`))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  console.log('— Carga inicial —')
  console.log('  título página:', await page.title())
  console.log('  biblioteca visible:', await page.locator('.page-title').count())

  // Importar EPUB directamente en el input oculto
  await page.setInputFiles('input[type=file][accept*="epub"]', EPUB)
  await page.waitForTimeout(2500)
  const cards = await page.locator('.book-card .bt').allTextContents()
  console.log('  libros:', cards)

  // Abrir el libro
  await page.locator('.book-card').first().tap()
  await page.waitForTimeout(3500)
  console.log('— Lector —')
  console.log('  url:', page.url().split('#')[1])
  console.log('  tarjeta:', await page.locator('.reader-content').count())
  console.log('  dock:', await page.locator('.action-dock').count())
  console.log('  iframe epub:', await page.locator('.epub-container iframe').count())
  const errLoad = await page.locator('.empty-state').textContent().catch(() => null)
  if (errLoad) console.log('  estado vacío/error:', errLoad.trim().slice(0, 120))

  // ¿Se puede pasar página con swipe?
  const before = await page.evaluate(() => {
    const f = document.querySelector('.epub-container iframe')
    return f?.contentDocument?.body?.textContent?.slice(0, 60) ?? null
  })
  console.log('  contenido visible:', JSON.stringify((before ?? '').trim().slice(0, 50)))
  // avanzar 2 secciones (la primera es solo portada)
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await page.waitForTimeout(1400)
  }
  const txt = await page.evaluate(() => document.querySelector('.epub-container iframe')?.contentDocument?.body?.textContent?.trim().slice(0, 60))
  console.log('  tras avanzar:', JSON.stringify(txt))
  // tap-palabra dentro del iframe → debe arrancar TTS
  const frame = page.frames().find((f) => f !== page.mainFrame())
  if (frame) {
    const p = frame.locator('p, h1, h2, div').filter({ hasText: /\w{4,}/ }).first()
    await p.tap({ timeout: 4000 }).catch((e) => console.log('  tap párrafo falló:', e.message.slice(0, 90)))
    await page.waitForTimeout(2500)
    const st = await page.evaluate(() => ({
      dockActivo: document.querySelector('.action-dock')?.classList.contains('active'),
      speaking: speechSynthesis.speaking,
    }))
    console.log('  tap-palabra →', JSON.stringify(st))
    await page.evaluate(() => speechSynthesis.cancel())
    await page.locator('.dock-btn[title="stop"]').tap({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(600)
  }

  // PLAY
  console.log('— Play —')
  const t0 = Date.now()
  await page.locator('.dock-play').tap({ timeout: 5000 }).catch((e) => console.log('  tap play falló:', e.message.slice(0, 100)))
  // ¿sigue respondiendo la página?
  const alive = await Promise.race([
    page.evaluate(() => 1 + 1).then(() => true),
    new Promise((r) => setTimeout(() => r(false), 6000)),
  ])
  console.log(`  página responde tras play: ${alive} (${Date.now() - t0} ms)`)
  await page.waitForTimeout(2500)
  const dockState = await page.evaluate(() => ({
    activo: document.querySelector('.action-dock')?.classList.contains('active'),
    speaking: window.speechSynthesis?.speaking ?? 'sin API',
    pending: window.speechSynthesis?.pending ?? 'sin API',
    voces: window.speechSynthesis ? speechSynthesis.getVoices().length : -1,
  })).catch((e) => ({ evalError: e.message.slice(0, 150) }))
  console.log('  estado dock/speech:', JSON.stringify(dockState))

  // ¿scroll en modo scrolled?
} catch (err) {
  console.log('EXCEPCIÓN DEL TEST:', err.message)
}

console.log('— Consola/errores de la página —')
for (const l of logs.slice(0, 25)) console.log(' ', l)
if (logs.length === 0) console.log('  (sin errores)')

await browser.close()
