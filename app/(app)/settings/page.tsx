import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { DangerZone } from "@/components/settings/danger-zone";
import { OrganizationForm } from "@/components/settings/organization-form";
import { requireOrgContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export default async function SettingsPage() {
  const { org, role, user } = await requireOrgContext();
  const canEdit = role === "owner";

  return (
    <>
      <PageHeader title="Settings" description="Your organisation as it appears in drafted answers and across the app." />
      <div className="grid max-w-3xl gap-8">
        <section aria-labelledby="org-title" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-6">
          <h2 id="org-title" className="text-lg">
            Organisation
          </h2>
          <p className="mt-0.5 mb-4 text-sm text-muted-foreground">
            You are the {role === "owner" ? "owner" : "member"} of this organisation, signed in as {user.email}.
          </p>
          <OrganizationForm name={org.name} timezone={org.timezone} timeZones={timeZones()} canEdit={canEdit} />
        </section>

        <section aria-labelledby="style-title" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-6">
          <h2 id="style-title" className="text-lg">
            Answer style
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts are concise and written as {org.name} (&ldquo;We&hellip;&rdquo;). Yes/no questions start with Yes, No or
            Partially, and every factual sentence cites a passage. Custom style notes are not configurable yet.
          </p>
        </section>

        <section aria-labelledby="danger-title">
          <h2 id="danger-title" className="mb-3 text-lg">
            Danger zone
          </h2>
          <DangerZone canEdit={canEdit} ownerEmail={user.email} />
        </section>
      </div>
    </>
  );
}
