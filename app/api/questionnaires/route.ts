import { errorResponse, orgContextOr401 } from "@/app/api/_lib/respond";
import { formText, readUpload } from "@/app/api/_lib/upload";
import { createQuestionnaireFromUpload } from "@/lib/services/questionnaires";

/**
 * POST /api/questionnaires — upload a customer questionnaire (spec 3.2).
 * multipart/form-data: `file` (XLSX or CSV, 10 MB), `name` (defaults to the
 * file name), optional `customer`. Responds 201 with the `MappingPreview`
 * `{ questionnaire, mapping, preview, questionCount, format }`; the user then
 * confirms the mapping (`confirmMapping`). 402 when the Free monthly
 * questionnaire is used.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await orgContextOr401();
  if (auth instanceof Response) return auth;
  const upload = await readUpload(request);
  if (upload instanceof Response) return upload;
  try {
    const result = await createQuestionnaireFromUpload(auth.org, {
      ...upload.file,
      name: formText(upload.form, "name") ?? "",
      customer: formText(upload.form, "customer") ?? null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "questionnaire upload");
  }
}
