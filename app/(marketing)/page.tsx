import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { CtaLink } from "@/components/marketing/cta-link";
import { Faq } from "@/components/marketing/faq";
import { ReviewGridMock } from "@/components/marketing/mocks/review-grid-mock";
import {
  DraftCardsMock,
  GuardrailLogMock,
  KnowledgeBaseMock,
  KnowledgeGapsMock,
  MappingMock,
  ReviewExportMock,
} from "@/components/marketing/mocks/step-mocks";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { SectionLabel } from "@/components/marketing/section-label";
import { container, links, textLink, wideContainer } from "@/components/marketing/site";
import { SourceList, SourceMarker } from "@/components/marketing/sources";

export const metadata: Metadata = {
  title: { absolute: "Attestly · Security questionnaires, answered with citations" },
  description:
    "Upload your policies and the customer's spreadsheet. Attestly drafts every answer from your own documents with a citation to the exact passage, turns questions with no evidence into tasks, and writes approved answers back into the original workbook.",
  alternates: { canonical: "/" },
};

const steps = [
  {
    title: "Build the knowledge base",
    actor: "you",
    body: (
      <>
        Upload policies as PDF, DOCX, Markdown or text, or paste them in. Each one is split into passages that keep
        their heading path, such as <span className="font-mono text-[0.8125rem]">Access Control Policy › 4.2</span>,
        and indexed for search. Import an answered questionnaire and its answers become a reusable library.
      </>
    ),
    visual: <KnowledgeBaseMock />,
  },
  {
    title: "Upload the questionnaire",
    actor: "Attestly proposes, you confirm",
    body: (
      <>
        Drop in the customer&rsquo;s XLSX or CSV exactly as they sent it. Attestly picks the sheet with the most text,
        finds the header row, and proposes which column holds the questions and which takes the answers. Every
        question keeps its sheet, row and column, so answers can go back into the same cells.
      </>
    ),
    visual: <MappingMock />,
  },
  {
    title: "Draft with evidence",
    actor: "model drafts, rules verify",
    body: (
      <>
        For each question, Attestly searches your passages and past answers by meaning and by keyword, and the model
        drafts only from what it finds. Each answer cites the passage it rests on. When nothing supports an answer,
        the question becomes a task with a note of the document that would answer it.
      </>
    ),
    visual: <DraftCardsMock />,
  },
  {
    title: "Review and export",
    actor: "you",
    body: (
      <>
        Approve, edit or mark not applicable, from the keyboard if you like. On Pro, Export XLSX keeps the
        customer&rsquo;s workbook and writes each answer into its answer cell; CSV export is on every plan. Approved
        answers join your library, so the next questionnaire starts further ahead.
      </>
    ),
    visual: <ReviewExportMock />,
  },
];

const guardrails = [
  {
    rule: "Citation ids must exist.",
    detail: "Every citation must point at a passage retrieved for that question. Anything else is dropped.",
  },
  {
    rule: "Quotes must appear in the passage.",
    detail: "Each quoted sentence is matched against the cited text after normalising whitespace and punctuation.",
  },
  {
    rule: "Zero valid citations means needs evidence.",
    detail: "A draft with nothing left to cite is downgraded, with a one-line note of what document would answer it.",
  },
  {
    rule: "Yes/no questions get a yes or a no.",
    detail: "Answers to yes/no questions open with Yes, No or Partially, so the column can be read at a glance.",
  },
];

const trust = [
  {
    title: "Documents stay in your database",
    body: "Uploaded files, extracted text and answers live in the app's Postgres database, and every row is scoped to your organisation.",
  },
  {
    title: "Embeddings are vectors, not copies",
    body: "Search runs on a list of 768 numbers per passage. The passage text is kept once, next to its vector, for citations.",
  },
  {
    title: "Synthetic demo data only",
    body: "The demo workspace loads six invented policies and a generated questionnaire. Please keep real policies out of the public demo.",
  },
  {
    title: "Every model call is logged",
    body: "Each draft records the model, the prompt version, tokens and latency, so any answer can be traced to the call that wrote it.",
  },
  {
    title: "No training on your data by us",
    body: "Attestly does not train or fine-tune any model on your documents or answers.",
  },
  {
    title: "Which tier embeds what",
    body: "Embeddings for the demo workspace use Gemini's free tier, which Google may use to improve its products. That is acceptable for invented policies and not for real ones, so bring your own key before you upload your own documents.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* a. Hero */}
      <section aria-labelledby="hero-title" className="ledger-lines border-b border-foreground/15">
        <div className={cn(container, "grid gap-8 pt-12 pb-10 sm:pt-16 lg:grid-cols-12 lg:gap-10 lg:pt-20 lg:pb-14")}>
          <div className="lg:col-span-7">
            <SectionLabel>For small SaaS vendors selling to enterprises</SectionLabel>
            <h1
              id="hero-title"
              className="mt-6 text-[2.5rem] leading-[1.04] tracking-[-0.03em] text-balance sm:text-5xl lg:text-[3.75rem]"
            >
              Security questionnaires, answered with citations.
            </h1>
          </div>
          <div className="lg:col-span-5 lg:self-end">
            <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-foreground/85">
              Upload your policies and the customer&rsquo;s spreadsheet. Every answer is drafted from your own
              documents with a citation to the exact passage. Questions with no evidence become tasks, and approved
              answers write back into the original workbook.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CtaLink href={links.signUp}>Start free</CtaLink>
              <CtaLink href="#how-it-works" tone="outline">
                See how it works
              </CtaLink>
            </div>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              Free: one questionnaire a month, up to 100 questions. No card needed.
            </p>
          </div>
        </div>
        <div className={cn(wideContainer, "pb-14 sm:pb-20")}>
          <ReviewGridMock />
        </div>
      </section>

      {/* b. Problem strip */}
      <section aria-labelledby="problem-title" className="border-b border-foreground/15 bg-card">
        <div className={cn(container, "py-14 sm:py-16")}>
          <SectionLabel clause="1">The problem</SectionLabel>
          <h2 id="problem-title" className="mt-3 max-w-2xl text-2xl leading-snug text-balance sm:text-3xl">
            Every enterprise deal brings a spreadsheet, and someone senior fills it in by hand.
          </h2>
          <ul className="mt-10 grid border-t border-foreground/20 md:grid-cols-3">
            <li className="flex flex-col border-b border-border py-7 md:border-b-0 md:py-8 md:pr-8">
              <p className="tabular font-heading text-5xl leading-none font-semibold tracking-[-0.04em] sm:text-6xl">
                20–40<span className="ml-2 text-2xl tracking-normal sm:text-3xl">hours</span>
              </p>
              <p className="mt-4 max-w-[19rem] text-[0.9375rem] leading-snug">
                per comprehensive questionnaire.
                <SourceMarker n={1} />
              </p>
            </li>
            <li className="flex flex-col border-b border-border py-7 md:border-b-0 md:border-l md:px-8 md:py-8">
              <p className="tabular font-heading text-5xl leading-none font-semibold tracking-[-0.04em] sm:text-6xl">
                72%
              </p>
              <p className="mt-4 max-w-[19rem] text-[0.9375rem] leading-snug">
                of SaaS vendors say security reviews delay deals by 2+ weeks.
                <SourceMarker n={2} />
              </p>
            </li>
            <li className="flex flex-col py-7 md:border-l md:py-8 md:pl-8">
              <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground uppercase">And the tools</p>
              <p className="mt-4 max-w-[19rem] font-heading text-xl leading-snug font-medium">
                Incumbent questionnaire tools are sold as annual compliance-platform contracts.
              </p>
            </li>
          </ul>
          <SourceList className="mt-6 border-t border-border pt-4" />
        </div>
      </section>

      {/* c. How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-4">
        <div className={cn(container, "py-20 sm:py-28")}>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <SectionLabel clause="2">How it works</SectionLabel>
              <h2 id="how-title" className="mt-4 text-4xl leading-[1.08] text-balance sm:text-5xl">
                From policy folder to finished workbook.
              </h2>
            </div>
            <p className="max-w-md text-[0.9375rem] leading-relaxed text-foreground/85 lg:col-span-5 lg:col-start-8 lg:self-end">
              Four steps, and each one says who does it. The model writes drafts. It never approves one, and it never
              writes to the customer&rsquo;s file.
            </p>
          </div>

          <ol className="mt-14 border-t border-foreground/20">
            {steps.map((step, i) => (
              <li key={step.title} className="grid gap-8 border-b border-border py-10 md:grid-cols-12 md:py-14">
                <div className="md:col-span-5 lg:col-span-4">
                  <p className="flex items-baseline gap-3 font-mono text-xs text-muted-foreground">
                    <span aria-hidden="true" className="tabular text-2xl font-medium text-evergreen">
                      2.{i + 1}
                    </span>
                    <span>
                      <span className="sr-only">Done by: </span>
                      <span aria-hidden="true">by </span>
                      <span className="text-foreground">{step.actor}</span>
                    </span>
                  </p>
                  <h3 className="mt-4 text-2xl leading-snug">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-foreground/85">{step.body}</p>
                </div>
                <div className="min-w-0 md:col-span-7 lg:col-span-7 lg:col-start-6">{step.visual}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* d. Principle */}
      <section aria-labelledby="principle-title" className="ledger-lines border-y border-foreground/15">
        <div className={cn(container, "grid gap-12 py-20 sm:py-28 lg:grid-cols-12")}>
          <div className="lg:col-span-6">
            <SectionLabel clause="3">Principle</SectionLabel>
            <h2 id="principle-title" className="mt-4 text-4xl leading-[1.08] text-balance sm:text-5xl">
              Every answer cites its source or says it has none.
            </h2>
            <p className="mt-6 max-w-lg text-[0.9375rem] leading-7 text-foreground/85">
              The model drafts. Rules verify. Four deterministic checks run on every draft before it reaches the
              review grid, and no uncited claim is ever shown as an answer.
            </p>
            <ol className="mt-8 border-t border-foreground/20">
              {guardrails.map((g, i) => (
                <li key={g.rule} className="grid grid-cols-[2.5rem_1fr] border-b border-border py-3.5">
                  <span className="tabular pt-px font-mono text-xs leading-7 text-evergreen">3.{i + 1}</span>
                  <p className="text-[0.9375rem] leading-7">
                    <strong className="font-semibold">{g.rule}</strong>{" "}
                    <span className="text-foreground/80">{g.detail}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:pt-14">
            <GuardrailLogMock />
          </div>
        </div>
      </section>

      {/* e. Knowledge gaps */}
      <section aria-labelledby="gaps-title" className={cn(container, "py-20 sm:py-28")}>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionLabel clause="4">Knowledge gaps</SectionLabel>
            <h2 id="gaps-title" className="mt-4 text-4xl leading-[1.08] text-balance sm:text-5xl">
              Gaps tell you which policy to write next.
            </h2>
            <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-foreground/85">
              Questions marked needs evidence are grouped by similarity across every questionnaire and labelled by
              topic. Three questions about cyber insurance is a document you are missing, not three answers to
              improvise. Write it once, index it, and the next customer who asks gets a cited answer.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-6 lg:col-start-7">
            <KnowledgeGapsMock />
          </div>
        </div>
      </section>

      {/* f. Trust */}
      <section aria-labelledby="trust-title" className="border-y border-foreground/15 bg-card">
        <div className={cn(container, "grid gap-10 py-20 sm:py-28 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <SectionLabel clause="5">Data handling</SectionLabel>
            <h2 id="trust-title" className="mt-4 text-4xl leading-[1.08] text-balance">
              What happens to your documents.
            </h2>
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-foreground/85">
              The full list of providers is on the{" "}
              <Link href={links.privacy} className={textLink}>
                privacy page
              </Link>
              .
            </p>
          </div>
          <dl className="border-t border-foreground/20 lg:col-span-8">
            {trust.map((t) => (
              <div key={t.title} className="grid gap-1.5 border-b border-border py-5 sm:grid-cols-[15rem_1fr] sm:gap-8">
                <dt className="font-medium">{t.title}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-foreground/85">{t.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* g. Pricing */}
      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-4">
        <div className={cn(container, "grid gap-12 py-20 sm:py-28 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <SectionLabel clause="6">Pricing</SectionLabel>
            <h2 id="pricing-title" className="mt-4 text-4xl leading-[1.08] sm:text-5xl">
              Two plans. One is free.
            </h2>
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-foreground/85">
              Start with the demo workspace. Move to Pro when answers need to go back into the customer&rsquo;s own
              workbook.{" "}
              <Link href={links.pricing} className={textLink}>
                Compare plans
              </Link>
              .
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <PricingPlans />
          </div>
        </div>
      </section>

      {/* h. FAQ */}
      <section aria-labelledby="faq-title" className="border-t border-foreground/15">
        <div className={cn(container, "grid gap-10 py-20 sm:py-28 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <SectionLabel clause="7">Questions</SectionLabel>
            <h2 id="faq-title" className="mt-4 text-4xl leading-[1.08] sm:text-5xl">
              Answered, with sources.
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <Faq />
          </div>
        </div>
      </section>

      {/* i. Final CTA */}
      <section aria-labelledby="cta-title" className="ledger-lines border-t border-foreground/15">
        <div className={cn(container, "grid gap-8 py-16 sm:py-20 md:grid-cols-12 md:items-end")}>
          <div className="md:col-span-7">
            <h2 id="cta-title" className="text-4xl leading-[1.08] text-balance sm:text-5xl">
              Answer the next questionnaire from your own policies.
            </h2>
          </div>
          <div className="md:col-span-5 md:justify-self-end">
            <div className="flex flex-wrap gap-3">
              <CtaLink href={links.signUp}>Start free</CtaLink>
              <CtaLink href={links.pricing} tone="outline">
                See pricing
              </CtaLink>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Load the demo workspace and review a drafted questionnaire. No card needed.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
