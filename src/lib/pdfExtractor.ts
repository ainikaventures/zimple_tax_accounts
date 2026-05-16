/* src/lib/pdfExtractor.ts — extract plain text from a PDF in the browser.
 *
 * Uses pdfjs-dist's legacy (no-worker) build so we don't have to fight
 * Next.js / Turbopack about worker bundling. PDF parsing is rare in this
 * app (one per uploaded statement, opt-in), so running it on the main
 * thread is fine — extraction of a 12-page text PDF takes <1s.
 *
 * Text-PDF only. Scanned image PDFs come back as the empty string (no
 * text layer to extract). Surface that to the user as "no text found —
 * is the PDF scanned?". */

"use client";

const MAX_PDF_BYTES = 60 * 1024 * 1024; // hard cap on raw input
const MAX_OUTPUT_CHARS = 60_000; // ~15k tokens; safe for most LLMs

export interface PdfExtractionResult {
  /** Extracted plain text — empty string if the PDF has no text layer. */
  text: string;
  /** Number of pages processed. */
  pageCount: number;
  /** Whether the text was truncated because it exceeded MAX_OUTPUT_CHARS. */
  truncated: boolean;
}

/**
 * Extract plain text from a PDF File. The dynamic import keeps pdfjs-dist
 * out of the main bundle — it only loads when the user actually drops a
 * PDF on the upload page.
 */
export async function extractTextFromPdf(file: File): Promise<PdfExtractionResult> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)} MB.`,
    );
  }

  // pdfjs v5 still needs a real worker source, even in the legacy build.
  // The `sync-pdf-worker` script copies pdf.worker.min.mjs into public/
  // on dev/build, so we can serve it from the same origin.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  let truncated = false;
  let totalChars = 0;

  for (let pageIdx = 1; pageIdx <= doc.numPages; pageIdx++) {
    const page = await doc.getPage(pageIdx);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      // The TextItem union has both TextItem and TextMarkedContent shapes;
      // we only care about the former which carries `str` and `transform`.
      if (!("str" in item)) continue;
      const ti = item as { str: string; transform: number[] };
      const y = ti.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.length > 0) lines.push(currentLine.join(" "));
        currentLine = [];
      }
      if (ti.str.trim()) currentLine.push(ti.str);
      lastY = y;
    }
    if (currentLine.length > 0) lines.push(currentLine.join(" "));
    const pageText = lines.join("\n");
    if (totalChars + pageText.length > MAX_OUTPUT_CHARS) {
      pages.push(pageText.slice(0, MAX_OUTPUT_CHARS - totalChars));
      truncated = true;
      break;
    }
    pages.push(pageText);
    totalChars += pageText.length;
  }

  await doc.cleanup();
  await doc.destroy();

  return {
    text: pages.join("\n\n"),
    pageCount: doc.numPages,
    truncated,
  };
}
