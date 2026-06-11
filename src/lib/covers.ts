// Generador de portadas procedurales SVG.
// Semilla = título + autor → paleta editorial + composición determinista.

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Paletas editoriales: [fondo, fondo2, tinta, acento, acento suave]
const PALETTES: [string, string, string, string, string][] = [
  ['#f2ead8', '#e7dcc2', '#3a3127', '#b8860b', '#e9c46a'], // marfil/oro
  ['#1d2a3f', '#16202f', '#dfe6f2', '#9db8e8', '#5b7cb8'], // noche/luna
  ['#ece4d4', '#ded2b8', '#4a3b28', '#a3692c', '#d9a05b'], // sepia/ocre
  ['#27332b', '#1e2922', '#e3e8df', '#a7c4a0', '#6f8a68'], // bosque
  ['#f0e0d6', '#e4cec0', '#4d3326', '#b35c3a', '#d98e6a'], // terracota
  ['#2c2438', '#231c2d', '#e8e0f0', '#b9a3d6', '#8a6fae'], // ciruela
  ['#e8e8e2', '#d9d9d0', '#3c3c36', '#7a7a5c', '#a8a884'], // salvia
  ['#312723', '#271f1c', '#ece2d4', '#d4af6a', '#9c7c45'], // tinta/oro
  ['#dfe7ea', '#cdd9de', '#2e3c42', '#5c8a99', '#8fb5c2'], // bruma marina
  ['#f4ece0', '#e9dcc8', '#43352a', '#8a4f3d', '#c2876f'], // arcilla clara
]

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Parte el título en líneas balanceadas de máx ~14 caracteres. */
function titleLines(title: string): string[] {
  const words = title.trim().split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 14) {
      lines.push(cur)
      cur = w
    } else {
      cur = cur ? cur + ' ' + w : w
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 5)
}

export function generateCoverSvg(title: string, author: string): string {
  const seed = hashSeed(`${title}::${author}`)
  const rnd = mulberry32(seed)
  const W = 600
  const H = 880
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)]
  const [bg, bg2, ink, accent, accentSoft] = pal
  const comp = Math.floor(rnd() * 5)

  let art = ''

  if (comp === 0) {
    // Arco con luna — bóveda de biblioteca
    const moonY = 190 + rnd() * 80
    art = `
      <path d="M 90 620 L 90 330 A 210 210 0 0 1 510 330 L 510 620 Z" fill="${bg2}" stroke="${accent}" stroke-width="2.5" stroke-opacity="0.8"/>
      <path d="M 130 620 L 130 345 A 170 170 0 0 1 470 345 L 470 620 Z" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity="0.28"/>
      <circle cx="300" cy="${moonY + 130}" r="${34 + rnd() * 16}" fill="${accentSoft}" opacity="0.95"/>
      <circle cx="300" cy="${moonY + 130}" r="${52 + rnd() * 18}" fill="none" stroke="${accent}" stroke-width="1" stroke-opacity="0.5"/>
      ${Array.from({ length: 14 }, () => {
        const x = 110 + rnd() * 380
        const y = 250 + rnd() * 330
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.8 + rnd() * 1.6).toFixed(1)}" fill="${ink}" opacity="${(0.25 + rnd() * 0.4).toFixed(2)}"/>`
      }).join('')}`
  } else if (comp === 1) {
    // Órbitas concéntricas — astrolabio
    const cx = 300
    const cy = 360
    const rings = Array.from({ length: 5 }, (_, i) => {
      const r = 60 + i * (38 + rnd() * 14)
      const dash = rnd() > 0.5 ? `stroke-dasharray="${(2 + rnd() * 6).toFixed(1)} ${(4 + rnd() * 8).toFixed(1)}"` : ''
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${i === 2 ? accent : ink}" stroke-width="${i === 2 ? 2 : 1}" stroke-opacity="${i === 2 ? 0.9 : 0.3}" ${dash}/>`
    }).join('')
    const planets = Array.from({ length: 4 }, () => {
      const ang = rnd() * Math.PI * 2
      const r = 60 + Math.floor(rnd() * 5) * 42
      const px = cx + Math.cos(ang) * r
      const py = cy + Math.sin(ang) * r
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(5 + rnd() * 9).toFixed(1)}" fill="${rnd() > 0.4 ? accentSoft : accent}"/>`
    }).join('')
    art = rings + planets + `<circle cx="${cx}" cy="${cy}" r="13" fill="${accent}"/>`
  } else if (comp === 2) {
    // Bandas horizontales — lomos apilados
    let y = 180
    const bands: string[] = []
    while (y < 600) {
      const h = 26 + rnd() * 64
      const inset = rnd() * 70
      const fill = rnd() > 0.72 ? accentSoft : rnd() > 0.5 ? bg2 : 'none'
      bands.push(
        `<rect x="${(90 + inset).toFixed(1)}" y="${y}" width="${(420 - inset * 2).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(h / 2, 18).toFixed(1)}" fill="${fill}" stroke="${ink}" stroke-width="1" stroke-opacity="${fill === 'none' ? 0.45 : 0.18}"/>`,
      )
      y += h + 12
    }
    art = bands.join('')
  } else if (comp === 3) {
    // Constelación — el mapa intelectual en miniatura
    const pts = Array.from({ length: 9 }, () => ({
      x: 120 + rnd() * 360,
      y: 180 + rnd() * 400,
      r: 3 + rnd() * 7,
    }))
    const lines = pts
      .slice(1)
      .map((p, i) => {
        const q = pts[i]
        return `<line x1="${q.x.toFixed(1)}" y1="${q.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${ink}" stroke-width="1" stroke-opacity="0.35"/>`
      })
      .join('')
    const dots = pts
      .map(
        (p, i) =>
          `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${i % 3 === 0 ? accent : accentSoft}"/>`,
      )
      .join('')
    art = `${lines}${dots}<circle cx="${pts[0].x.toFixed(1)}" cy="${pts[0].y.toFixed(1)}" r="${(pts[0].r + 7).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.7"/>`
  } else {
    // Sol partido — horizonte editorial
    const cy = 350 + rnd() * 60
    const r = 120 + rnd() * 50
    art = `
      <clipPath id="half"><rect x="0" y="0" width="${W}" height="${cy}"/></clipPath>
      <circle cx="300" cy="${cy}" r="${r.toFixed(1)}" fill="${accentSoft}" clip-path="url(#half)"/>
      <circle cx="300" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.7"/>
      <line x1="90" y1="${cy}" x2="510" y2="${cy}" stroke="${ink}" stroke-width="1.5" stroke-opacity="0.6"/>
      ${Array.from({ length: 7 }, (_, i) => {
        const yy = cy + 22 + i * 18
        const inset = i * 26
        return `<line x1="${110 + inset}" y1="${yy}" x2="${490 - inset}" y2="${yy}" stroke="${ink}" stroke-width="1" stroke-opacity="${(0.4 - i * 0.05).toFixed(2)}"/>`
      }).join('')}`
  }

  const lines = titleLines(title)
  const fontSize = lines.some((l) => l.length > 11) ? 42 : 50
  const titleY = 672
  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="300" y="${titleY + i * (fontSize + 8)}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="${fontSize}" font-weight="600" fill="${ink}" letter-spacing="0.5">${esc(l)}</text>`,
    )
    .join('')
  const authorY = titleY + lines.length * (fontSize + 8) + 16
  const authorSvg = author
    ? `<text x="300" y="${Math.min(authorY, 842)}" text-anchor="middle" font-family="Georgia, serif" font-size="21" font-style="italic" fill="${ink}" opacity="0.72">${esc(author)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgg)"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${ink}" stroke-width="1.2" stroke-opacity="0.35" rx="6"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${ink}" stroke-width="0.6" stroke-opacity="0.2" rx="4"/>
  ${art}
  <line x1="210" y1="${titleY - fontSize - 14}" x2="390" y2="${titleY - fontSize - 14}" stroke="${accent}" stroke-width="1.6" stroke-opacity="0.85"/>
  ${titleSvg}
  ${authorSvg}
</svg>`
}

export function coverDataUrl(title: string, author: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateCoverSvg(title, author))}`
}
