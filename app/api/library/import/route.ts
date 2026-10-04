import { errorResponse, orgContextOr401 } from "@/app/api/_lib/respond";
import { readUpload } from "@/app/api/_lib/upload";
import { importLibraryFromWorkbook } from "@/lib/services/library";

/**
 * POST /api/library/import — import a past questionnaire (XLSX or CSV with
 * question and answer columns) into the answer library (spec 3.1).
 * multipart/form-data: `file`. Columns are detected automatically. Responds
 * with `ImportLibraryResult` `{ imported, skippedEmpty, skippedDuplicates, embedded, mapping }`.
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await orgContextOr401();
  if (auth instanceof Response) return auth;
  const upload = await readUpload(request);
  if (upload instanceof Response) return upload;
  try {
    const result = await importLibraryFromWorkbook(auth.org.id, upload.file.bytes, undefined, {
      fileName: upload.file.fileName,
      mimeType: upload.file.mimeType,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "library import");
  }
}
