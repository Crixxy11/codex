# DECISIONS.md — Decisiones de arquitectura de Codex

Registro de las decisiones con trade-offs relevantes, en orden de impacto.

---

## 1. Stack: Vite + React + TypeScript, sin backend

**Decisión:** SPA estática (Vite + React 18 + TS) servida desde GitHub Pages.
Estado con Zustand (ajustes) y Dexie/IndexedDB (todos los datos).

**Por qué:** el brief exige PWA offline para un solo usuario sin login. Un
backend solo añadiría latencia, costo y un punto de fallo. React por
madurez del ecosistema (epub.js, pdf.js, dexie-react-hooks integran sin
fricción). TypeScript estricto porque la app la mantiene una sola persona
y el compilador es el segundo par de ojos.

**Trade-off aceptado:** sin servidor no hay sync automático (ver §6).

## 2. TTS híbrido: Web Speech API + Piper neuronal (WASM)

**Decisión:** dos engines tras una interfaz común (`TtsEngine`):

- `SystemEngine` — Web Speech API. Acceso a las voces del dispositivo,
  incluidas las premium de iOS/macOS. Cero descarga. **Se pausa al
  bloquear la pantalla en iOS** (limitación de plataforma, no nuestra).
- `PiperEngine` — síntesis neuronal local vía `@mintplex-labs/piper-tts-web`
  (ONNX Runtime + WASM). Genera WAV reproducido por un `<audio>` real con
  MediaSession ⇒ **sigue sonando con la pantalla bloqueada**, con controles
  en el lock screen. Modelos de ~20–115 MB que se descargan una vez (OPFS).

El `TtsController` es único: cola de oraciones, prefetch de síntesis
(2 oraciones por delante), auto-avance de página, skip ±1 oración,
velocidad 0.5×–2.5×. Añadir ElevenLabs/OpenAI/Google mañana = implementar
`TtsEngine.synthesize()` y registrar voces; la reproducción no se toca.

**Detalle crítico:** el paquete Piper referencia por defecto los WASM de
onnxruntime 1.18 en CDN, pero empaqueta el JS de onnxruntime 1.26 →
incompatible. Auto-alojamos los WASM 1.26 en `public/ort/` y los pasamos
vía `wasmPaths`. Quedan fuera del precache (26 MB) y se cachean bajo
demanda con CacheFirst.

## 3. Lectores: tres implementaciones, un solo contrato

**Decisión:** no forzar una abstracción única de render. Cada formato usa
la herramienta correcta — epub.js, pdf.js, render propio para texto — y
todos implementan el mismo contrato de eventos (`ReaderEvents`): progreso,
selección, tap-de-palabra (TTS), tap-en-vacío (cromo), tap-en-subrayado.

- **EPUB:** epub.js con flujo `paginated`/`scrolled`. Tema y tipografía
  inyectados al iframe. Subrayados = CFI ranges (estándar EPUB, robustos a
  cambios de fuente/tamaño).
- **PDF:** render a canvas + capa de texto propia (spans posicionados con
  la transformación del viewport). Paginado = una página "contain";
  scroll = lista perezosa con IntersectionObserver. Subrayados = offsets de
  carácter sobre el texto concatenado de cada página, pintados como rects
  calculados con `Range.getClientRects()` ⇒ precisos a cualquier zoom.
- **Texto:** párrafos renderizados por React; paginación con columnas CSS
  y translación horizontal. Subrayados = offsets globales de carácter.

**Por qué offsets/CFI y no XPath o coordenadas:** sobreviven a cambios de
tipografía, tamaño, interlínea y viewport; y son la forma correcta para el
futuro mapa intelectual (un fragmento es una posición en un texto, no un
pixel).

## 4. Modelo de datos pensado como dataset

Tablas Dexie: `books`, `files` (blobs), `covers`, `highlights`, `sessions`,
`events`, `kv`. Decisiones:

- **Todo lleva `updatedAt`** ⇒ merge determinista al sincronizar.
- **`events` es un log append-only** (libro abierto, página pasada,
  subrayado creado, TTS iniciado…). Las estadísticas se *derivan*; el dato
  crudo nunca se pierde. Es la materia prima del mapa intelectual.
- **`sessions` registra tiempo activo real** (heartbeat de 5 s que descarta
  pausas >60 s), tiempo TTS separado, palabras leídas por delta de progreso
  × wordCount del libro. El WPM se calcula como mediana de sesiones
  visuales sustanciales — robusto a outliers.
- Subrayado = `{quote, note?, anchor, chapter?}`: la cita viaja con el
  anclaje, así las notas sobreviven aunque el libro se borre.

## 5. Portadas procedurales deterministas

Semilla = hash(título+autor) → paleta editorial (10 curadas) + composición
(5: arco/luna, astrolabio, lomos, constelación, horizonte). SVG generado al
vuelo, sin almacenar: la misma entrada produce siempre la misma portada en
ambos dispositivos sin sincronizar nada.

## 6. Sync: export/import `.codex` con merge

**Decisión:** archivo único `.codex` (zip vía fflate: manifest JSON +
blobs de libros y portadas). Import = merge: entidades nuevas se añaden,
conflictos se resuelven por `updatedAt`, el progreso conserva el máximo,
nada se borra nunca.

**Por qué no automático:** una PWA no puede tocar CloudKit; un backend
gratuito (Firebase/Supabase) introduce dependencia externa y credenciales.
El flujo manual (Compartir → Guardar en iCloud Drive → importar en el otro
dispositivo) es 100 % confiable y deja la capa de datos lista para
enchufar sync real después (los timestamps ya existen).

## 7. HashRouter en vez de BrowserRouter

GitHub Pages no tiene rewrites de servidor; con rutas hash la PWA funciona
offline y los deep links nunca dan 404. El costo estético (`#/stats`) es
irrelevante en una app instalada.

## 8. i18n casero (ES/EN)

Un diccionario tipado y un hook `useT()`. ~150 claves no justifican
i18next (+30 KB y otra API que aprender). Si algún día hay plurales
complejos o más idiomas, se migra mecánicamente.

## 9. Gráficas SVG propias (d3-shape/d3-scale solamente)

Área suavizada (curveMonotoneX), calendario de actividad, reloj radial de
24 h, pétalos semanales, donut, sparklines. Una librería de charts
completa pesa más que toda nuestra UI y ninguna da el look editorial que
piden las referencias. d3-shape son ~10 KB y solo genera paths.

## 10. Auto-"Leído" al 90 %

Se evalúa al guardar progreso (no en un cron): cruzar 0.9 marca
`finished`, registra el evento y dispara la celebración. El 90 % y no el
100 % porque notas finales, índices y colofones hacen que "terminado"
real ocurra antes del final físico del archivo.
