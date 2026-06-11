# POSTMORTEM.md — Codex v1

Lo que pediste al terminar: limitaciones sin maquillaje, ideas para
superarlas, y sugerencias proactivas.

---

## 1. Reporte de limitaciones

### Plataforma (iOS / Safari)

1. **Web Speech API se detiene al bloquear el iPhone.** Es la limitación
   más dura del proyecto y no tiene workaround dentro de esa API: Safari
   suspende `speechSynthesis` en background. Por eso existe la ruta Piper
   (audio real + MediaSession), que sí sobrevive al bloqueo. Consecuencia
   honesta: *las voces premium de iOS solo sirven con pantalla activa*.

2. **Síntesis Piper en iPhone es más lenta que en Mac.** ONNX en WASM
   corre con los hilos que da Safari; en un iPhone reciente una oración
   tarda ~0.5–2 s. El prefetch de 2 oraciones lo oculta casi siempre, pero
   tras un salto manual de oración puede haber una pausa de carga audible.

3. **Voz italiana limitada.** El catálogo libre de Piper solo tiene
   `it_IT-riccardo-x_low` (calidad básica). Español, inglés y alemán
   tienen voces media/alta buenas; italiano cojea. Con pantalla activa,
   las voces italianas del sistema (Alice, etc.) son mejores opción.

4. **OPFS y `speechSynthesis.pause()` tienen rarezas en iOS.** Los modelos
   Piper se guardan en OPFS (iOS ≥ 16.4); en versiones viejas de iOS la
   descarga de voces fallará. `pause()` de la Web Speech API en iOS a
   veces actúa como stop; el controlador reinicia la oración actual al
   reanudar como mitigación.

5. **La primera síntesis neuronal requiere red** (descarga del modelo y
   de los WASM de fonemización desde CDN). Después, todo queda cacheado
   (service worker + OPFS) y funciona offline. El runtime ONNX ya se
   sirve desde la propia app (`public/ort/`).

6. **IndexedDB puede ser purgado por Safari** si el dispositivo va corto
   de espacio y la app no se usa en semanas. Como PWA *instalada* el
   riesgo es bajo, y pedimos `navigator.storage.persist()`… no, mentira:
   **no lo pedimos en v1** — está en ideas (§2.6). Mitigación actual:
   exporta `.codex` regularmente.

### Librerías

7. **epub.js está semiabandonado y sus tipos son incompletos.** Hay varios
   `as unknown as` en `EpubView` para acceder a spine/contents. Funciona
   bien con EPUBs normales; EPUBs muy rotos pueden renderizar raro.
   El resaltado de la oración TTS dentro del EPUB usa `cfiFromRange`
   (best-effort): en capítulos con DOM exótico puede no pintarse, aunque
   la lectura continúa.

8. **La capa de texto del PDF es aproximada.** pdf.js da items con
   transformaciones; nuestro span-layer ajusta el ancho con `scaleX`, lo
   que hace la selección ligeramente "elástica" en PDFs con kerning denso.
   El tap-de-palabra usa fallback proporcional cuando `caretRangeFromPoint`
   no coopera. En PDFs escaneados (sin texto) no hay selección ni TTS —
   haría falta OCR (§2.4).

9. **Conteo de páginas/avance en EPUB depende de `locations`** que se
   generan async al abrir (~1–3 s en libros grandes); hasta entonces el
   % de progreso es una aproximación por capítulo.

### Diseño / app

10. **El modo paginado de texto no hace doble columna en Mac** (un solo
    "folio" centrado). Decisión de simplicidad, no limitación técnica.

11. **El export `.codex` carga todos los blobs en memoria** al generar el
    zip. Con bibliotecas de varios cientos de MB en un iPhone viejo podría
    presionar memoria. (Streaming zip resolvería, §2.7.)

12. **Las estadísticas de "páginas leídas" cuentan pasos de página**, no
    páginas únicas: releer una página la cuenta dos veces. Es la métrica
    honesta posible sin un modelo de páginas canónico entre formatos.

---

## 2. Ideas para superar las limitaciones

1. **Lock-screen con voces del sistema** → imposible en PWA. La salida
   real es empaquetar la misma base con Capacitor y usar `AVSpeechSynthesizer`
   nativo + audio en background. El adaptador `TtsEngine` ya está diseñado
   para que eso sea un engine más.

2. **Síntesis más rápida** → migrar a WebGPU cuando Safari habilite
   `navigator.gpu` para ONNX Runtime (ya hay builds jsep); o pre-sintetizar
   el capítulo entero en segundo plano mientras lees con pantalla activa.

3. **Mejor italiano** → conectar un proveedor cloud (ElevenLabs/OpenAI)
   con el adaptador existente; o entrenar/importar un modelo Piper italiano
   de la comunidad cuando aparezca uno medium.

4. **PDFs escaneados** → Tesseract.js (WASM) como paso de import opcional:
   OCR por página al añadir el libro, guardando el texto en una tabla
   paralela que alimentaría selección, TTS y búsqueda.

5. **Sync automático real** → dos rutas sin backend propio: (a) WebRTC
   directo Mac⇄iPhone cuando ambos tienen la app abierta (sin servidor,
   solo un canal de señalización efímero); (b) un bucket S3/R2 con token
   en ajustes — el merge por `updatedAt` ya existe, solo cambia el
   transporte. La ruta (b) es un fin de semana de trabajo.

6. **Persistencia garantizada** → llamar `navigator.storage.persist()` al
   arrancar (one-liner pendiente) y mostrar el estado en Ajustes.

7. **Export streaming** → `fflate` soporta `Zip` incremental con
   `FileSystemWritableFileStream`; evitaría cargar blobs en memoria.

8. **Búsqueda de texto completo** dentro de los libros → índice invertido
   ligero (lunr/minisearch) construido al importar, guardado en Dexie.

---

## 3. Sugerencias proactivas

### Para la experiencia de lectura
- **Doble página en Mac** (spread de libro abierto) en EPUB y texto.
- **Desplazamiento automático** (auto-scroll a velocidad regulable) como
  tercer modo de lectura — combina muy bien con TTS.
- **Marcadores con nombre** además de la posición automática ("la escena
  del juicio") y salto rápido entre ellos.
- **Tap en el lomo de progreso** para saltar a cualquier % del libro.
- **Modo enfoque**: atenuar todo excepto el párrafo bajo el dedo/cursor.

### Para el TTS
- **Resaltado palabra a palabra** con las voces del sistema (el evento
  `boundary` de la Web Speech API lo da casi gratis en macOS).
- **Cola de lectura**: "leer estos tres subrayados", o "leer el capítulo 4
  mientras cocino".
- **Auto-pausa inteligente** al quitarte los AirPods (evento
  `devicechange`).

### Para la biblioteca y los datos
- `navigator.storage.persist()` + indicador de espacio usado en Ajustes.
- **Series y colecciones** (agrupar libros, ordenar por saga).
- **Import por compartir**: registrar la PWA como share target para
  mandar EPUBs desde otras apps en iOS.
- **Metas de lectura** (minutos/día) integradas con las rachas — la
  infraestructura de sesiones ya lo soporta.

### Hacia el mapa intelectual (la visión)
Los datos ya están en la forma correcta: subrayados con cita + anclaje,
eventos crudos, autores y tags por tiempo de lectura. Los siguientes pasos
concretos, en orden:

1. **Extracción de conceptos local**: un modelo de embeddings pequeño en
   WASM (p. ej. all-MiniLM cuantizado, ~25 MB — misma técnica que Piper)
   que vectorice cada subrayado al crearlo. Sin nube, sin API keys.
2. **Aristas por similitud**: con los vectores, conectar subrayados de
   libros distintos cuando su similitud supere un umbral. "Este fragmento
   de Fromm conversa con aquel de Marco Aurelio" emerge solo.
3. **El grafo como vista**: force-directed sobre canvas (d3-force), nodos
   = libros/autores/subrayados, sobre el tema Noche — exactamente la
   estética de tus referencias de nodos.
4. **El espejo textual**: con clusters de vectores se pueden generar
   lecturas como "tu lectura gravita hacia X" sin ningún LLM — los nombres
   de los clusters pueden venir de las palabras más centrales; y si algún
   día quieres frases más finas, un LLM por API es un engine más, igual
   que en TTS.

Lo que NO haría: meter recomendaciones. El brief lo dice bien — el mapa
es un espejo, no un vendedor.

---

## Estado de verificación

Probado en navegador (Chromium) con libros reales: import EPUB con
portada embebida, import PDF con metadatos, texto pegado; lectura
paginada y scroll en los tres formatos; subrayado y persistencia en los
tres; tap-de-palabra → TTS con auto-avance y resaltado de oración (PDF,
EPUB y texto); posición restaurada tras recarga; sesiones y estadísticas
acumulando; los 7 temas; export de dataset. **Pendiente de probar en
hardware real**: iPhone (instalación PWA, voces Piper en Safari iOS,
lock screen) — requiere el deploy a GitHub Pages.
