import { isAuthorizedCron, unauthorized } from "@/app/api/_lib/secrets";
import { runDailyMaintenance } from "@/lib/services/maintenance";

/**
 * Daily job (vercel.json: 05:30 UTC). `Authorization: Bearer <CRON_SECRET>`.
 * Purges expired share links and re-embeds chunks and library answers whose
 * embedding is missing (batches of 100). Returns a JSON summary.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  try {
    const summary = await runDailyMaintenance();
    console.info(
      `[cron] daily: purged ${summary.purgedShareLinks} share links, embedded ${summary.chunks.embedded} chunks and ${summary.libraryAnswers.embedded} library answers, ${summary.errors.length} errors`,
    );
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron] daily failed", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "daily job failed" }, { status: 500 });
  }
}
