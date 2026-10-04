import type { Metadata } from "next";
import { Check, CircleCheck, Info } from "lucide-react";
import { ManageButton, UpgradeButton } from "@/components/billing/billing-buttons";
import { PageHeader } from "@/components/app/page-header";
import { formatDate } from "@/components/dashboard/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/session";
import { knowledgeStats } from "@/lib/services/knowledge";
import {
  FREE_PAGES,
  FREE_QUESTIONNAIRES_PER_MONTH,
  FREE_QUESTIONS_PER_QUESTIONNAIRE,
  limitsFor,
  monthStartUtc,
  nextMonthStartUtc,
} from "@/lib/services/plan-limits";
import { listQuestionnaires } from "@/lib/services/questionnaires";
import { isDemoQuestionnaire } from "@/lib/services/shared";
import { isBillingConfigured, isPortalConfigured } from "@/lib/stripe/billing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

/** Plans from spec 2. Pro runs in Stripe test mode only. */
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      `${FREE_QUESTIONNAIRES_PER_MONTH} questionnaire a month, up to ${FREE_QUESTIONS_PER_QUESTIONNAIRE} questions`,
      `${FREE_PAGES} policy pages`,
      "Review grid with citations",
      "CSV export",
      "Demo workspace",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "per month",
    features: [
      "Unlimited questionnaires and questions",
      "Unlimited policy pages",
      "XLSX round-trip export into the customer's workbook",
      "Answer library export",
      "Shareable read-only review links",
      "Team notes",
    ],
  },
] as const;

function requestTime(): Date {
  return new Date();
}

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { org, role } = await requireOrgContext();
  const { checkout } = await searchParams;
  const now = requestTime();
  const [stats, questionnaires] = await Promise.all([knowledgeStats(org.id), listQuestionnaires(org.id, { limit: 200 })]);
  const since = monthStartUtc(now);
  const usedThisMonth = questionnaires.filter(
    (q) => q.createdAt >= since && q.status !== "mapping" && !isDemoQuestionnaire(q),
  ).length;
  const limits = limitsFor(org.plan);

  const isPro = org.plan === "pro";
  const configured = isBillingConfigured();
  const portalAvailable = Boolean(isPortalConfigured() && org.stripeCustomerId);
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader
        title="Billing"
        description={
          <>
            {limits.questionnairesPerMonth === null ? (
              <>
                <span className="tabular font-mono text-foreground">{usedThisMonth}</span> questionnaires this month, no
                limit.
              </>
            ) : (
              <>
                <span className="tabular font-mono text-foreground">{usedThisMonth}</span> of{" "}
                <span className="tabular font-mono text-foreground">{limits.questionnairesPerMonth}</span> questionnaire
                used this month (resets {formatDate(nextMonthStartUtc(now), "UTC")}).
              </>
            )}{" "}
            {stats.pageLimit === null ? (
              <>
                <span className="tabular font-mono text-foreground">{stats.pagesUsed}</span> policy pages, no limit.
              </>
            ) : (
              <>
                <span className="tabular font-mono text-foreground">{stats.pagesUsed}</span> of{" "}
                <span className="tabular font-mono text-foreground">{stats.pageLimit}</span> policy pages.
              </>
            )}
          </>
        }
      />

      {checkout === "success" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-approved/10 px-4 py-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-approved" aria-hidden />
          {isPro
            ? "Payment received. You're on Pro."
            : "Payment received. Your plan switches to Pro as soon as Stripe confirms it, usually within a few seconds. Refresh to check."}
        </p>
      ) : checkout === "cancelled" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Checkout cancelled. Nothing was charged.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const current = plan.id === org.plan;
          return (
            <Card key={plan.id} className={cn(current && "ring-2 ring-primary")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  {plan.name}
                  {current ? (
                    <Badge variant="secondary" className="font-mono tracking-wide uppercase">
                      Current plan
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  <span className="tabular font-heading text-3xl font-bold text-foreground">{plan.price}</span>{" "}
                  <span>{plan.period}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="grid gap-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-approved" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              {plan.id === "pro" ? (
                <CardFooter className="flex-col items-stretch gap-3">
                  {isPro ? (
                    <ManageButton disabled={!portalAvailable || !isOwner} />
                  ) : (
                    <UpgradeButton disabled={!configured || !isOwner} />
                  )}
                  {!isPro && org.stripeCustomerId ? <ManageButton disabled={!portalAvailable || !isOwner} /> : null}
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-2 text-sm text-foreground/75">
        <p className="ledger-lines rounded-lg border border-dashed bg-card px-4 py-3">
          <span className="font-medium text-foreground">Test mode:</span> pay with card{" "}
          <span className="font-mono text-foreground">4242 4242 4242 4242</span>, any future expiry date, any CVC and
          postcode. No real charge is made.
        </p>
        <p>
          Cancelling or a failed renewal moves the organisation back to Free. Questionnaires, documents and library
          answers are kept; XLSX export, library export and creating share links need Pro again.
        </p>
        {!configured ? (
          <p>
            Billing is not set up on this deployment: <span className="font-mono text-xs">STRIPE_SECRET_KEY</span> and{" "}
            <span className="font-mono text-xs">STRIPE_PRICE_PRO_MONTHLY</span> are missing, so the buttons are disabled.
          </p>
        ) : null}
        {!isOwner ? <p>Only the organisation owner can change the plan.</p> : null}
        {isPro && !portalAvailable && configured ? (
          <p>Subscription management opens once Stripe has linked a customer to this organisation.</p>
        ) : null}
      </div>
    </>
  );
}
