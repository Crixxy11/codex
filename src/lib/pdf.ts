import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = pdfjs.PDFDocumentProxy

export function getDocumentSafe(data: ArrayBuffer): Promise<PdfDocument> {
  return pdfjs.getDocument({ data }).promise
}
