"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, FormActionState } from "@/components/dashboard/action-result";
import { requireOrgContext } from "@/lib/auth/session";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import { clearDemoWorkspace } from "@/lib/services/demo";
import { actionError, formText } from "../_lib/action-errors";

/*
 * Settings Server Actions. requireOrgContext() first; changes are for the
 * organisation owner. There is no settings service, so the organisation
 * update goes through the org-scoped repository (`updateSettings`), with the
 * input validated here first because the repository throws plain Errors.
 */

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  name: z
    .string()
    .min(1, { error: "Enter the organisation name." })
    .max(120, { error: "Keep the name under 120 characters." }),
  timezone: z.string().refine(isTimeZone, { error: "Choose a valid time zone." }),
});

export async function updateOrganizationAction(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") return { ok: false, error: "Only the organisation owner can change these settings." };
  const parsed = settingsSchema.safeParse({ name: formText(formData, "name"), timezone: formText(formData, "timezone") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const updated = await organizationsRepo.updateSettings(ctx.org.id, parsed.data);
    if (!updated) return { ok: false, error: "The organisation was not found." };
  } catch (error) {
    return actionError(error, "update organisation");
  }
  // The name shows in the app shell on every page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

/** Removes the synthetic demo workspace (documents, library answers, questionnaire). User content stays. */
export async function clearDemoAction(): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") return { ok: false, error: "Only the organisation owner can remove the demo workspace." };
  try {
    const result = await clearDemoWorkspace(ctx.org.id);
    revalidatePath("/", "layout");
    const removed = result.documents + result.libraryAnswers + result.questionnaires;
    return {
      ok: true,
      message:
        removed === 0
          ? "There was no demo content to remove."
          : `Removed ${result.documents} demo documents, ${result.libraryAnswers} library answers and ${result.questionnaires} questionnaire${result.questionnaires === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return actionError(error, "clear demo workspace");
  }
}
