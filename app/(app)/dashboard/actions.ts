"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormActionState } from "@/components/dashboard/action-result";
import { requireOrgContext } from "@/lib/auth/session";
import { seedDemoWorkspace } from "@/lib/services/demo";
import { actionError } from "../_lib/action-errors";

/**
 * "Load demo workspace" (spec 3.7): six synthetic policies, a 12-answer
 * library and the 40-question Acme Corp questionnaire with its mapping
 * confirmed. Idempotent in the service. On success it redirects to the
 * questionnaire, whose review page drives drafting.
 */
export async function loadDemoWorkspace(): Promise<FormActionState> {
  const ctx = await requireOrgContext();
  let questionnaireId: string;
  try {
    ({ questionnaireId } = await seedDemoWorkspace(ctx.org));
  } catch (error) {
    return actionError(error, "seed demo workspace");
  }
  revalidatePath("/dashboard");
  revalidatePath("/knowledge");
  revalidatePath("/library");
  revalidatePath("/questionnaires");
  redirect(`/questionnaires/${questionnaireId}`);
}
