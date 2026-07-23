// ============================================================================
// MODULE : Document text extraction
// ============================================================================
//
// Turns an uploaded PDF / DOCX / TXT into plain text for storage and later
// retrieval by the AI assistant. Kept isolated so the parsing libraries
// (pdf-parse, mammoth) are only ever loaded on the server, on demand — they pull
// in native-ish dependencies that must never reach the client bundle.

const MAX_TEXT_LENGTH = 500_000; // Guard against a pathological file exhausting memory/DB.

export type ExtractableType = "TXT" | "PDF" | "DOCX";

/** Map a filename / MIME type to the document type we know how to extract. */
export function detectDocType(filename: string, mimeType?: string): ExtractableType | null {
  const lower = filename.toLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "PDF";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "DOCX";
  }
  if (mimeType === "text/plain" || lower.endsWith(".txt")) return "TXT";
  return null;
}

/**
 * Extract plain text from a document buffer.
 *
 * The parsers are dynamically imported so their (heavy, Node-only) dependency
 * trees never load unless a document of that type is actually processed, and are
 * marked as server-external packages in next.config so the bundler leaves them
 * to be required from node_modules at runtime.
 *
 * @throws {Error} If the type is unsupported or the file cannot be parsed.
 */
export async function extractText(data: Buffer, type: ExtractableType): Promise<string> {
  let text: string;

  if (type === "TXT") {
    text = data.toString("utf8");
  } else if (type === "DOCX") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer: data });
    text = result.value;
  } else {
    // PDF — pdf-parse v2 exposes a class; feed it the buffer as `data`.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(data) });
    const result = await parser.getText();
    text = result.text;
  }

  // Normalise line endings and collapse long runs of blank lines; keep real spacing.
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}
