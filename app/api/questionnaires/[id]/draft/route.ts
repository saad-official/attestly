import { errorResponse, orgContextOr401 } from "@/app/api/_lib/respond";
import { DEFAULT_DRAFT_BATCH, draftBatch } from "@/lib/services/questionnaires";

/**
 * POST /api/questionnaires/[id]/draft — drafts the next batch of pending
 * questions (spec 3.3, 15 per request). Optional JSON body `{ "limit": n }`
 * (1..50). Responds with `DraftBatchResult`:
 * `{ processed, failed, remaining, status, counts, busy }`. The review page
 * calls it again while `remaining > 0`.
 *
 * Errors: 401 signed out, 404 unknown questionnaire, 409 mapping not
 * confirmed, 503 no AI provider configured.
 */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/questionnaires/[id]/draft">) {
  const auth = await orgContextOr401();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;

  let limit = DEFAULT_DRAFT_BATCH;
  try {
    const body = (await request.json()) as { limit?: unknown };
    if (typeof body?.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(1, Math.floor(body.limit)), 50);
    }
  } catch {
    // No or non-JSON body: default batch size.
  }

  try {
    const result = await draftBatch(auth.org.id, id, { limit });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, `draft ${id}`);
  }
}
