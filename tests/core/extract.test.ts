import { describe, expect, it } from "vitest";
import { UnsupportedDocumentError, extractText } from "@/lib/ingest/extract";
import { buildDocx, buildPdf } from "@/tests/fixtures/documents";

const encode = (s: string) => new TextEncoder().encode(s);

describe("extractText", () => {
  it("extracts merged text and the page count from a PDF", async () => {
    const bytes = buildPdf([
      ["Information Security Policy", "MFA is required on all systems."],
      ["Backups are encrypted daily."],
    ]);
    const result = await extractText({ bytes, mimeType: "application/pdf", fileName: "policy.pdf" });
    expect(result.pages).toBe(2);
    expect(result.text).toContain("MFA is required on all systems.");
    expect(result.text).toContain("Backups are encrypted daily.");
    expect(result.warnings).toEqual([]);
  });

  it("warns when a PDF has no extractable text (scanned)", async () => {
    const bytes = buildPdf([[]]);
    const result = await extractText({ bytes, mimeType: "application/pdf", fileName: "scan.pdf" });
    expect(result.text).toBe("");
    expect(result.warnings.join(" ")).toMatch(/no extractable text/i);
  });

  it("extracts raw text from a DOCX, one paragraph per block", async () => {
    const bytes = buildDocx(["Access Control Policy", "Access is reviewed quarterly."]);
    const result = await extractText({
      bytes,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "access.docx",
    });
    expect(result.text).toContain("Access Control Policy");
    expect(result.text).toContain("Access is reviewed quarterly.");
    expect(result.pages).toBeUndefined();
  });

  it("returns Markdown and text as-is with normalised line endings", async () => {
    const md = await extractText({
      bytes: encode("# Title\r\n\r\nBody line\rnext\n"),
      mimeType: "text/markdown",
      fileName: "a.md",
    });
    expect(md.text).toBe("# Title\n\nBody line\nnext\n");

    const txt = await extractText({ bytes: encode(`${String.fromCharCode(0xfeff)}plain\r\ntext`), mimeType: "text/plain", fileName: "a.txt" });
    expect(txt.text).toBe("plain\ntext");
  });

  it("falls back to the file extension when the MIME type is generic", async () => {
    const result = await extractText({
      bytes: encode("## Heading"),
      mimeType: "application/octet-stream",
      fileName: "notes.MD",
    });
    expect(result.text).toBe("## Heading");
  });

  it("throws a typed error for unsupported types", async () => {
    const attempt = extractText({ bytes: encode("x"), mimeType: "image/png", fileName: "logo.png" });
    await expect(attempt).rejects.toBeInstanceOf(UnsupportedDocumentError);
    await expect(attempt).rejects.toMatchObject({ code: "unsupported_type", mimeType: "image/png" });
  });

  it("wraps parser failures in a typed error", async () => {
    const attempt = extractText({ bytes: encode("not a pdf"), mimeType: "application/pdf", fileName: "bad.pdf" });
    await expect(attempt).rejects.toMatchObject({ name: "DocumentExtractionError", code: "parse_failed" });
  });
});
