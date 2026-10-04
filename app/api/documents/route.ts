import { errorResponse, orgContextOr401 } from "@/app/api/_lib/respond";
import { formText, readUpload } from "@/app/api/_lib/upload";
import { DOCUMENT_KINDS } from "@/lib/db/schema";
import type { DocumentKind } from "@/lib/db/types";
import { pasteDocument, uploadDocument } from "@/lib/services/knowledge";

/**
 * POST /api/documents — add a knowledge-base document (spec 3.1).
 * - multipart/form-data: `file` (PDF, DOCX, MD, TXT; 10 MB), optional
 *   `title`, optional `kind` (policy | past_questionnaire | pasted; default policy).
 * - application/json: `{ "title": "...", "text": "..." }` (pasted text).
 * Responds 201 with `{ document }` (status "ready", or "failed" with `error`).
 * 402 when the Free page quota would be exceeded.
 *
 * A route rather than a server action because server actions cap request
 * bodies at 1 MB by default.
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await orgContextOr401();
  if (auth instanceof Response) return auth;

  try {
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await request.json().catch(() => null)) as { title?: unknown; text?: unknown } | null;
      const document = await pasteDocument(auth.org.id, {
        title: typeof body?.title === "string" ? body.title : "",
        text: typeof body?.text === "string" ? body.text : "",
      });
      return Response.json({ document }, { status: 201 });
    }

    const upload = await readUpload(request);
    if (upload instanceof Response) return upload;
    const kindValue = formText(upload.form, "kind");
    const kind: DocumentKind = (DOCUMENT_KINDS as readonly string[]).includes(kindValue ?? "")
      ? (kindValue as DocumentKind)
      : "policy";
    const document = await uploadDocument(auth.org.id, {
      ...upload.file,
      title: formText(upload.form, "title"),
      kind,
    });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "document upload");
  }
}
