import type { Metadata } from "next";
import { cn } from "cn";
import { Faq } from "@/components/marketing/faq";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { SectionLabel } from "@/components/marketing/section-label";
import { container } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free: one questionnaire a month up to 100 questions, 25 policy pages, review grid and CSV export. Pro is $49/month for unlimited questionnaires, XLSX round-trip export, answer library export, shareable review links and team notes. Stripe runs in test mode.",
  alternates: { canonical: "/pricing" },
};

const rows: { feature: string; free: string | null; pro: string | null; mono?: boolean }[] = [
  { feature: "Questionnaires", free: "1 a month, up to 100 questions", pro: "Unlimited" },
  { feature: "Policy pages in the knowledge base", free: "25", pro: "Unlimited", mono: true },
  { feature: "Drafts with citations and guardrail checks", free: "Included", pro: "Included" },
  { feature: "Review grid with keyboard shortcuts", free: "Included", pro: "Included" },
  { feature: "Knowledge gaps", free: "Included", pro: "Included" },
  { feature: "CSV export", free: "Included", pro: "Included" },
  { feature: "XLSX round-trip into the customer's workbook", free: null, pro: "Included" },
  { feature: "Answer library export", free: null, pro: "Included" },
  { feature: "Shareable read-only review links", free: null, pro: "Included" },
  { feature: "Team notes", free: null, pro: "Included" },
  { feature: "Demo workspace with synthetic policies", free: "Included", pro: "Included" },
  { feature: "Price", free: "$0", pro: "$49/month, test mode", mono: true },
];

function Cell({ value, mono }: { value: string | null; mono?: boolean }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className={cn(mono && "tabular font-mono text-[0.8125rem]")}>{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="ledger-lines border-b border-foreground/15">
        <div className={cn(container, "grid gap-12 pt-12 pb-20 sm:pt-16 sm:pb-24 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <SectionLabel>Pricing</SectionLabel>
            <h1 id="pricing-title" className="mt-4 text-4xl leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl">
              Priced per team, not per compliance programme.
            </h1>
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-foreground/85">
              Two plans, billed monthly. Start on Free with the demo workspace, and move to Pro when answers need to go
              back into the customer&rsquo;s own workbook.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <PricingPlans headingLevel="h2" />
          </div>
        </div>
      </section>

      <section aria-labelledby="compare-title" className="bg-card">
        <div className={cn(container, "grid gap-10 py-20 sm:py-24 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <h2 id="compare-title" className="text-3xl leading-tight sm:text-4xl">
              Side by side
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Both plans draft with the same retrieval, the same citations and the same guardrails. Pro adds volume and
              the round trip back into the customer&rsquo;s file.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Free and Pro plans compared</caption>
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[28%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-foreground/30">
                  <th scope="col" className="py-3 pr-3 font-mono text-xs font-medium text-muted-foreground uppercase">
                    Feature
                  </th>
                  <th scope="col" className="py-3 pr-3 text-base font-semibold">
                    Free
                  </th>
                  <th scope="col" className="py-3 text-base font-semibold">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature} className="border-b border-border align-top">
                    <th scope="row" className="py-3 pr-3 font-normal break-words text-muted-foreground">
                      {r.feature}
                    </th>
                    <td className="py-3 pr-3 break-words">
                      <Cell value={r.free} mono={r.mono} />
                    </td>
                    <td className="py-3 break-words">
                      <Cell value={r.pro} mono={r.mono} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-sm text-muted-foreground">
              Test mode. Checkout runs on Stripe&rsquo;s sandbox; no card is charged and no real payment is taken.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className={cn(container, "py-20 sm:py-24")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 id="faq-title" className="text-3xl leading-tight sm:text-4xl">
              Questions
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <Faq />
          </div>
        </div>
      </section>
    </>
  );
}
