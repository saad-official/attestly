/**
 * Text extraction for knowledge-base uploads (spec 3.1): PDF via unpdf,
 * DOCX via mammoth, Markdown and plain text as-is. Pure: bytes in, text out.
 */
import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export type DocumentFormat = "pdf" | "docx" | "markdown" | "text";

export type ExtractInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

export type ExtractResult = {
  text: string;
  /** Only known for PDFs. */
  pages?: number;
  warnings: string[];
};

export type ExtractErrorCode = "unsupported_type" | "parse_failed" | "too_large";

export class DocumentExtractionError extends Error {
  readonly code: ExtractErrorCode;
  readonly fileName: string;
  constructor(code: ExtractErrorCode, message: string, fileName: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.fileName = fileName;
  }
}

export class UnsupportedDocumentError extends DocumentExtractionError {
  readonly mimeType: string;
  constructor(mimeType: string, fileName: string) {
    super("unsupported_type", `Unsupported document type "${mimeType}" (${fileName}). Upload PDF, DOCX, Markdown or TXT.`, fileName);
    this.name = "UnsupportedDocumentError";
    this.mimeType = mimeType;
  }
}

/** Spec 3.1: uploads are capped at 10 MB. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MIME_FORMATS: Record<string, DocumentFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
};

const EXTENSION_FORMATS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
};

/** Resolve the format from the MIME type first, then the file extension. */
export function detectFormat(mimeType: string, fileName: string): DocumentFormat | null {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const byMime = MIME_FORMATS[mime];
  if (byMime) return byMime;
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? (EXTENSION_FORMATS[ext] ?? null) : null;
}

/** CRLF/CR to LF and strip a leading byte-order mark. */
export function normalizeLineEndings(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, "\n");
}

export async function extractText(input: ExtractInput): Promise<ExtractResult> {
  const { bytes, mimeType, fileName } = input;
  const format = detectFormat(mimeType, fileName);
  if (!format) throw new UnsupportedDocumentError(mimeType, fileName);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DocumentExtractionError("too_large", `${fileName} is larger than 10 MB.`, fileName);
  }

  try {
    switch (format) {
      case "pdf":
        return await extractPdf(bytes);
      case "docx":
        return await extractDocx(bytes);
      case "markdown":
      case "text":
        return extractPlain(bytes);
    }
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new DocumentExtractionError("parse_failed", `Could not read ${fileName}: ${reason}`, fileName, { cause: error });
  }
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  // pdf.js may take ownership of the buffer, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractPdfText(pdf, { mergePages: true });
  const normalized = normalizeLineEndings(text).trim();
  const warnings: string[] = [];
  if (normalized.length === 0) {
    warnings.push("The PDF has no extractable text (it may be scanned). Upload a text-based PDF or paste the text.");
  }
  return { text: normalized, pages: totalPages, warnings };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = normalizeLineEndings(result.value).trim();
  const warnings = result.messages.map((m) => m.message);
  if (text.length === 0) warnings.push("The document contains no text.");
  return { text, warnings };
}

function extractPlain(bytes: Uint8Array): ExtractResult {
  // TextDecoder drops a UTF-8 BOM by default; normalizeLineEndings covers decoded strings too.
  const text = normalizeLineEndings(new TextDecoder("utf-8").decode(bytes));
  const warnings: string[] = [];
  if (text.includes(String.fromCharCode(0xfffd))) warnings.push("Some characters could not be decoded as UTF-8.");
  if (text.trim().length === 0) warnings.push("The document contains no text.");
  return { text, warnings };
}
