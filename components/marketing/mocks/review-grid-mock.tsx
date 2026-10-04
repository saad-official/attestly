import { cn } from "cn";
import {
  CheckLine,
  Cite,
  Confidence,
  FauxButton,
  Figure,
  HeadingPath,
  Kbd,
  StatusChip,
  type Status,
} from "./parts";

type Row = {
  id: string;
  section: string;
  question: string;
  draft: React.ReactNode | null;
  note?: string;
  status: Status;
  confidence: number | null;
  selected?: boolean;
};

const rows: Row[] = [
  {
    id: "AC-04",
    section: "Access control",
    question: "Do you enforce multi-factor authentication for all administrative access?",
    draft: (
      <>
        Yes. Multi-factor authentication is required for all administrative and privileged access to production
        systems and cloud consoles.
        <Cite n={1} />
        <Cite n={2} />
      </>
    ),
    status: "drafted",
    confidence: 0.91,
    selected: true,
  },
  {
    id: "AC-09",
    section: "Access control",
    question: "How often are user access rights reviewed?",
    draft: (
      <>
        Quarterly. System owners review every account with production access and remove access that is no longer
        needed.
        <Cite n={3} />
      </>
    ),
    status: "approved",
    confidence: 0.88,
  },
  {
    id: "EN-02",
    section: "Encryption",
    question: "Is customer data encrypted at rest?",
    draft: (
      <>
        Yes. Customer data in databases and backups is encrypted at rest with AES-256, using keys managed by the
        cloud provider.
        <Cite n={4} />
      </>
    ),
    status: "drafted",
    confidence: 0.86,
  },
  {
    id: "IR-03",
    section: "Incident response",
    question: "Will you notify us of a security incident affecting our data, and within what time?",
    draft: (
      <>
        Yes. Affected customers are notified without undue delay and no later than 72 hours after an incident is
        confirmed.
        <Cite n={5} />
      </>
    ),
    status: "drafted",
    confidence: 0.83,
  },
  {
    id: "IN-01",
    section: "Insurance",
    question: "What are the coverage limits of your cyber insurance policy?",
    draft: null,
    note: "No document covers cyber insurance limits",
    status: "needs_evidence",
    confidence: null,
  },
  {
    id: "BC-05",
    section: "Business continuity",
    question: "What are your recovery time and recovery point objectives?",
    draft: (
      <>
        RTO of 8 hours and RPO of 1 hour for the production service, tested in an annual restore exercise.
        <Cite n={6} />
      </>
    ),
    status: "drafted",
    confidence: 0.74,
  },
];

/** Label shown only when the grid collapses into stacked rows on a narrow container. */
function StackLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 hidden font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase @max-3xl:block">
      {children}
    </span>
  );
}

const th = "border-b border-border bg-parchment px-3 py-2 text-left font-mono text-[0.625rem] font-medium tracking-[0.06em] text-muted-foreground uppercase";
const cell = "border-b border-border px-3 py-3 align-top @max-3xl:border-0 @max-3xl:p-0";

function Grid() {
  return (
    <div className="@container min-w-0">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[0.8125rem] leading-snug @max-3xl:block">
        <caption className="sr-only">
          Review grid for the Halcyon Health vendor security assessment: six of 142 questions
        </caption>
        <colgroup>
          <col className="w-[7.5rem]" />
          <col className="w-[14rem]" />
          <col />
          <col className="w-[8.75rem]" />
          <col className="w-[6.25rem]" />
        </colgroup>
        <thead className="@max-3xl:hidden">
          <tr>
            <th scope="col" className={th}>
              Section
            </th>
            <th scope="col" className={th}>
              Question
            </th>
            <th scope="col" className={th}>
              Draft answer
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Confidence
            </th>
          </tr>
        </thead>
        <tbody className="@max-3xl:block">
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn(
                "@max-3xl:grid @max-3xl:grid-cols-[minmax(0,1fr)_auto] @max-3xl:gap-x-3 @max-3xl:gap-y-2.5 @max-3xl:border-b @max-3xl:border-border @max-3xl:px-3.5 @max-3xl:py-4",
                r.selected && "bg-moss-light/30 @max-3xl:shadow-[inset_3px_0_0_var(--evergreen)]",
                r.status === "needs_evidence" && "bg-amber/[0.06]",
              )}
            >
              <td
                className={cn(
                  cell,
                  "@max-3xl:col-start-1 @max-3xl:row-start-1 @max-3xl:self-center",
                  r.selected && "shadow-[inset_3px_0_0_var(--evergreen)] @max-3xl:shadow-none",
                )}
              >
                <span className="block font-mono text-[0.6875rem] text-muted-foreground @max-3xl:inline">
                  {r.id}
                </span>
                <span className="mt-0.5 block text-[0.75rem] text-foreground/80 @max-3xl:mt-0 @max-3xl:ml-2 @max-3xl:inline">
                  {r.section}
                </span>
              </td>
              <th
                scope="row"
                className={cn(cell, "text-left font-medium @max-3xl:col-span-2 @max-3xl:row-start-2")}
              >
                {r.question}
                {r.selected ? <span className="sr-only"> (selected; its first citation is shown beside the grid)</span> : null}
              </th>
              <td className={cn(cell, "text-foreground/90 @max-3xl:col-span-2 @max-3xl:row-start-3")}>
                <StackLabel>Draft answer</StackLabel>
                {r.draft ? (
                  r.draft
                ) : (
                  <>
                    <span className="text-muted-foreground italic">No draft.</span>
                    <span className="mt-1.5 block border-l-2 border-amber pl-2 text-[0.75rem] leading-snug text-amber-foreground">
                      <span className="font-mono text-[0.625rem] tracking-[0.06em] uppercase">Note </span>
                      {r.note}
                    </span>
                  </>
                )}
              </td>
              <td className={cn(cell, "@max-3xl:col-start-2 @max-3xl:row-start-1 @max-3xl:self-center")}>
                <StatusChip status={r.status} />
              </td>
              <td className={cn(cell, "@max-3xl:col-span-2 @max-3xl:row-start-4")}>
                <span className="@max-3xl:flex @max-3xl:items-center @max-3xl:gap-2">
                  <span className="hidden font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase @max-3xl:inline">
                    Confidence
                  </span>
                  <Confidence value={r.confidence} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CitationPanel() {
  return (
    <aside
      aria-label="Source passage for citation 1"
      className="min-w-0 border-t border-border bg-parchment/60 xl:border-t-0 xl:border-l"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          Citation <Cite n={1} />
        </p>
        <p className="font-mono text-[0.6875rem] text-muted-foreground">1 of 2 · AC-04</p>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="text-sm font-medium">Access Control Policy</p>
          <HeadingPath parts={["Access Control Policy", "4.2 Multi-factor authentication"]} className="mt-0.5" />
          <p className="mt-1 font-mono text-[0.6875rem] break-words text-muted-foreground">
            access-control-policy.docx · v3 · chunk 14 of 38
          </p>
        </div>
        <blockquote className="passage text-[0.8125rem] leading-relaxed text-ink">
          <p className="font-mono text-[0.6875rem] font-medium">4.2 Multi-factor authentication</p>
          <p className="mt-1.5">
            <mark className="bg-evergreen/15 text-ink underline decoration-evergreen decoration-2 underline-offset-[3px]">
              Multi-factor authentication is required for all administrative and privileged access to production
              systems, cloud consoles and the identity provider.
            </mark>{" "}
            Accepted second factors are hardware security keys and authenticator apps; SMS codes are not accepted.
            Exceptions need written approval from the Security Lead and expire after 30 days.
          </p>
        </blockquote>
        <ul className="space-y-1 border-t border-border pt-3" aria-label="Checks run on this citation">
          <CheckLine ok>citation id in retrieved set</CheckLine>
          <CheckLine ok>quote found in passage</CheckLine>
          <CheckLine ok>answer opens with Yes/No</CheckLine>
        </ul>
        <div className="border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium">
            <Cite n={2} /> Information Security Policy
          </p>
          <HeadingPath parts={["Information Security Policy", "7.1 Privileged accounts"]} className="mt-0.5" />
        </div>
      </div>
    </aside>
  );
}

/** The hero visual: the review grid as a reviewer sees it, with one row selected. */
export function ReviewGridMock() {
  return (
    <Figure
      number="1"
      caption={
        <>
          The review grid. Northbeam Software, its customer Halcyon Health and every policy shown are fictional; the
          demo workspace is built the same way.
        </>
      }
    >
      <div className="overflow-hidden rounded-md border border-foreground/20 bg-card text-card-foreground shadow-card">
        {/* Title bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Halcyon Health · Vendor security assessment</p>
            <p className="font-mono text-[0.6875rem] break-words text-muted-foreground">
              halcyon-vendor-assessment.xlsx · sheet &ldquo;Vendor Assessment&rdquo;
            </p>
          </div>
          <p className="rounded-sm border border-border px-2 py-1 font-mono text-[0.6875rem] text-muted-foreground">
            Workspace: <span className="text-foreground">Northbeam Software</span>
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-parchment px-4 py-2.5">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]" aria-label="Question counts">
            <li className="font-medium text-foreground">
              All <span className="tabular font-mono text-xs text-muted-foreground">142</span>
            </li>
            <li className="text-foreground/80">
              Drafted <span className="tabular font-mono text-xs text-muted-foreground">118</span>
            </li>
            <li className="text-foreground/80">
              Needs evidence <span className="tabular font-mono text-xs text-amber-foreground">9</span>
            </li>
            <li className="text-foreground/80">
              Approved <span className="tabular font-mono text-xs text-muted-foreground">15</span>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <FauxButton>Approve all ≥ 0.85</FauxButton>
            <FauxButton tone="primary">Export XLSX</FauxButton>
          </div>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_19.5rem]">
          <Grid />
          <CitationPanel />
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border bg-parchment px-4 py-2 font-mono text-[0.6875rem] text-muted-foreground">
          <p>Showing 6 of 142 · row 1 selected</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>A</Kbd> approve
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>E</Kbd> edit
            </span>
          </p>
        </div>
      </div>
    </Figure>
  );
}
