// Build "legacy" de pdf.js: idéntico en navegadores modernos, pero
// incluye los polyfills (Promise.withResolvers, etc.) que el build
// normal de pdf.js v6 asume — sin él, iOS < 17.4 no renderiza nada.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Recursos de pdf.js auto-alojados: decodificadores WASM (jbig2/openjpeg/qcms
// para PDFs escaneados), CMaps (codificaciones), perfiles ICC y fuentes
// estándar. Sin ellos, muchos PDFs renderizan páginas en blanco.
const ASSETS = `${import.meta.env.BASE_URL}pdf/`

export type PdfDocument = pdfjs.PDFDocumentProxy

export function getDocumentSafe(data: ArrayBuffer): Promise<PdfDocument> {
  return pdfjs.getDocument({
    data,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
    cMapUrl: `${ASSETS}cmaps/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
  }).promise
}
