// WebKit escritorio (≈ Safari Mac): texto pegado → play → scroll
import { webkit } from 'playwright'

const browser = await webkit.launch()
const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage()
const logs = []
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`))
page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text().slice(0, 200)}`))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// añadir texto pegado
await page.locator('.add-fab').click()
await page.locator('.modal button', { hasText: 'Pegar texto' }).click()
await page.locator('.modal input[type=text]').first().fill('Prueba Safari')
const paras = Array.from({ length: 30 }, (_, i) => `Párrafo ${i + 1}. La vida es suficientemente larga para quien la ordena con sabiduría y atención plena cada día.`).join('\n\n')
await page.locator('.modal textarea').fill(paras)
await page.locator('.modal button', { hasText: 'Guardar' }).click()
await page.waitForTimeout(1200)
await page.locator('.book-card', { hasText: 'Prueba Safari' }).click()
await page.waitForTimeout(1800)
console.log('lector abierto:', await page.locator('.reader-content').count(), '| párrafos:', await page.evaluate(() => document.querySelectorAll('.text-content p').length))

// PLAY desde lo visible
const t0 = Date.now()
await page.locator('.dock-play').click({ timeout: 4000 })
const alive = await Promise.race([
  page.evaluate(() => 2).then(() => true),
  new Promise((r) => setTimeout(() => r(false), 5000)),
])
await page.waitForTimeout(1800)
const st = await page.evaluate(() => ({
  activo: document.querySelector('.action-dock')?.classList.contains('active'),
  speaking: speechSynthesis.speaking,
  overlay: document.querySelectorAll('.tts-sentence-overlay').length,
}))
console.log(`play: responde=${alive} (${Date.now() - t0} ms)`, JSON.stringify(st))

// ±10 s y velocidad
await page.locator('.dock-cluster.open .dock-btn[title="+10 s"]').click().catch((e) => console.log('  +10 falló:', e.message.slice(0, 80)))
await page.waitForTimeout(800)
console.log('tras +10s speaking:', await page.evaluate(() => speechSynthesis.speaking))
await page.locator('.dock-btn[title="stop"]').click().catch(() => {})

// scroll en modo scrolled
await page.locator('.reader-top-pill').nth(1).locator('button').first().click() // toggle flujo
await page.waitForTimeout(1200)
const scrolled = await page.evaluate(() => {
  const sc = document.querySelector('.text-reader')
  if (!sc) return null
  const before = sc.scrollTop
  sc.scrollBy(0, 600)
  return new Promise((r) => setTimeout(() => r({ before, after: sc.scrollTop }), 600))
})
console.log('scroll:', JSON.stringify(scrolled))

console.log('errores:', logs.length ? logs.slice(0, 8) : '(ninguno)')
await browser.close()
