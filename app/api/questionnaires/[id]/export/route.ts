import { attachment, errorResponse, orgContextOr401 } from "@/app/api/_lib/respond";
import { exportQuestionnaire, type ExportFormat } from "@/lib/services/questionnaires";

/**
 * GET /api/questionnaires/[id]/export?format=csv|xlsx — downloads the answers
 * (spec 3.5). CSV on every plan; XLSX round-trip is Pro (402 with
 * `{ code: "xlsx_export", upgradeUrl }` on Free).
 */
export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/questionnaires/[id]/export">) {
  const auth = await orgContextOr401();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const format = (new URL(request.url).searchParams.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "xlsx") {
    return Response.json({ error: "format must be csv or xlsx", code: "invalid_input" }, { status: 400 });
  }

  try {
    const file = await exportQuestionnaire(auth.org.id, id, format as ExportFormat);
    // Copy into a fresh ArrayBuffer-backed view (Response wants a BodyInit, not a Node Buffer slice).
    const body = new Uint8Array(file.bytes.byteLength);
    body.set(file.bytes);
    return new Response(body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": attachment(file.fileName),
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, `export ${id}`);
  }
}
