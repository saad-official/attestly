import { cn } from "cn";
import { CtaLink } from "./cta-link";
import { links } from "./site";

type Plan = {
  name: string;
  price: string;
  per?: string;
  summary: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

export const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    summary: "For the occasional questionnaire and a careful first look.",
    features: [
      "1 questionnaire a month, up to 100 questions",
      "25 policy pages",
      "Review grid with citations",
      "CSV export",
      "Demo workspace",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$49",
    per: "/month",
    summary: "For a team that answers a questionnaire every few weeks.",
    features: [
      "Unlimited questionnaires and policy pages",
      "XLSX round-trip export into the customer's workbook",
      "Answer library export",
      "Shareable read-only review links",
      "Team notes",
    ],
    cta: "Start with Pro",
    featured: true,
  },
];

/**
 * Two plans as a pair of spec sheets. The headingLevel prop keeps the
 * outline correct on the home page (h3) and the pricing page (h2).
 */
export function PricingPlans({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <li
            key={plan.name}
            className={cn(
              "flex flex-col rounded-md border bg-card p-6 sm:p-7",
              plan.featured ? "border-evergreen shadow-card" : "border-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-4">
              <Heading className="text-xl font-semibold">{plan.name}</Heading>
              {plan.featured ? (
                <span className="font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
                  Stripe test mode
                </span>
              ) : null}
            </div>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="tabular font-heading text-5xl leading-none font-semibold tracking-[-0.03em]">
                {plan.price}
              </span>
              {plan.per ? <span className="text-sm text-muted-foreground">{plan.per}</span> : null}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{plan.summary}</p>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-6 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="grid grid-cols-[1rem_1fr] items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[0.5625rem] translate-y-[-0.05em] rounded-[2px]",
                      plan.featured ? "bg-evergreen" : "border border-foreground/50",
                    )}
                  />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 md:mt-auto md:pt-8">
              <CtaLink href={links.signUp} tone={plan.featured ? "primary" : "outline"} className="w-full sm:w-auto">
                {plan.cta}
              </CtaLink>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        Test mode. Checkout runs on Stripe&rsquo;s sandbox; no card is charged and no real payment is taken.
      </p>
    </div>
  );
}
