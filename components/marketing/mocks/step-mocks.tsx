import { cn } from "cn";
import {
  CheckLine,
  Cite,
  Confidence,
  FauxButton,
  Figure,
  HeadingPath,
  Kbd,
  Panel,
  PanelHeader,
  StatusChip,
} from "./parts";

const chip = "status-chip whitespace-nowrap";

/* ---------------------------------------------------------------- Step 1 */

const documents = [
  { title: "Information Security Policy", file: "infosec-policy.pdf", chunks: 61, state: "indexed" },
  { title: "Access Control Policy", file: "access-control-policy.docx", chunks: 38, state: "indexed" },
  { title: "Incident Response Plan", file: "incident-response.md", chunks: 27, state: "indexed" },
  { title: "Business Continuity & DR", file: "bcdr-plan.pdf", chunks: 33, state: "indexed" },
  { title: "Vendor Management Policy", file: "vendor-management.docx", chunks: 18, state: "indexing" },
] as const;

export function KnowledgeBaseMock() {
  return (
    <Figure number="2" caption="Knowledge base. Each policy is split into passages that keep their heading path.">
      <Panel>
        <PanelHeader title="Knowledge base" meta="5 documents · 177 chunks" />
        <table className="w-full table-fixed text-[0.8125rem]">
          <caption className="sr-only">Policy documents with their chunk counts and indexing state</caption>
          <thead>
            <tr className="border-b border-border text-left font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase">
              <th scope="col" className="px-3.5 py-2 font-medium sm:px-4">
                Document
              </th>
              <th scope="col" className="w-[4.5rem] py-2 pr-3 text-right font-medium">
                Chunks
              </th>
              <th scope="col" className="w-[6.25rem] py-2 pr-3.5 font-medium sm:pr-4">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.file} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-3.5 py-2.5 text-left font-normal sm:px-4">
                  <span className="block font-medium">{d.title}</span>
                  <span className="block font-mono text-[0.6875rem] break-words text-muted-foreground">{d.file}</span>
                </th>
                <td className="tabular py-2.5 pr-3 text-right align-middle font-mono text-xs">{d.chunks}</td>
                <td className="py-2.5 pr-3.5 align-middle sm:pr-4">
                  <span
                    className={cn(
                      chip,
                      d.state === "indexed" ? "bg-approved/10 text-approved" : "bg-card text-muted-foreground",
                    )}
                  >
                    {d.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-parchment px-3.5 py-2.5 sm:px-4">
          <p className="text-[0.8125rem]">
            Answer library <span className="tabular font-mono text-xs text-muted-foreground">112 answers</span>
          </p>
          <p className="font-mono text-[0.6875rem] text-muted-foreground">from q3-customer-review.xlsx</p>
        </div>
      </Panel>
    </Figure>
  );
}

/* ---------------------------------------------------------------- Step 2 */

const sheetRows: { n: number; cells: string[]; header?: boolean; muted?: boolean }[] = [
  { n: 1, cells: ["Halcyon Health · Vendor Security Assessment", "", "", "", ""], muted: true },
  { n: 2, cells: ["Return to procurement by 31 Oct", "", "", "", ""], muted: true },
  { n: 3, cells: ["ID", "Domain", "Question", "Guidance", "Vendor response"], header: true },
  { n: 4, cells: ["AC-04", "Access", "Do you enforce MFA for…", "Include scope", ""] },
  { n: 5, cells: ["AC-09", "Access", "How often are user acc…", "", ""] },
];

const mapping = [
  { field: "ID", col: "A" },
  { field: "Section", col: "B" },
  { field: "Question", col: "C", key: true },
  { field: "Other (ignored)", col: "D" },
  { field: "Answer", col: "E", key: true },
];

export function MappingMock() {
  const letters = ["A", "B", "C", "D", "E"];
  return (
    <Figure number="3" caption="Column mapping preview. Attestly proposes it; you confirm it before anything is drafted.">
      <Panel>
        <PanelHeader title="halcyon-vendor-assessment.xlsx" meta="3 sheets" />
        <div className="grid gap-x-4 gap-y-1 border-b border-border px-3.5 py-3 text-[0.8125rem] sm:grid-cols-2 sm:px-4">
          <p>
            <span className="text-muted-foreground">Sheet </span>
            <span className="font-medium">&ldquo;Vendor Assessment&rdquo;</span>
          </p>
          <p>
            <span className="text-muted-foreground">Header row </span>
            <span className="tabular font-mono font-medium">3</span>
          </p>
        </div>
        <div className="px-3.5 py-3 sm:px-4">
          <table className="w-full table-fixed border-collapse font-mono text-[0.625rem] leading-tight sm:text-[0.6875rem]">
            <caption className="sr-only">First five rows of the sheet, with row 3 detected as the header row</caption>
            <colgroup>
              <col className="w-6" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col />
              <col className="w-[16%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="bg-parchment text-muted-foreground">
                <td className="border border-border px-1 py-1" />
                {letters.map((l) => (
                  <th
                    key={l}
                    scope="col"
                    className={cn(
                      "border border-border px-1 py-1 text-center font-medium",
                      (l === "C" || l === "E") && "bg-moss-light text-ink",
                    )}
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheetRows.map((r) => (
                <tr key={r.n} className={cn(r.header && "bg-moss-light/70 font-semibold text-ink")}>
                  <th scope="row" className="border border-border bg-parchment px-1 py-1 text-center font-medium text-muted-foreground">
                    {r.n}
                  </th>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={cn(
                        "truncate border border-border px-1 py-1",
                        r.muted && "text-muted-foreground",
                      )}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border px-3.5 py-3 text-[0.8125rem] sm:px-4">
          {mapping.map((m) => (
            <div key={m.field} className="contents">
              <dt className={cn(m.key ? "font-medium" : "text-muted-foreground")}>{m.field}</dt>
              <dd className="font-mono text-xs">
                <span aria-hidden="true" className="text-foreground/40">
                  →{" "}
                </span>
                column {m.col}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-parchment px-3.5 py-2.5 sm:px-4">
          <p className="font-mono text-[0.6875rem] text-muted-foreground">142 questions · 11 sections</p>
          <FauxButton tone="primary">Confirm mapping</FauxButton>
        </div>
      </Panel>
    </Figure>
  );
}

/* ---------------------------------------------------------------- Step 3 */

export function DraftCardsMock() {
  return (
    <Figure
      number="4"
      caption="Two drafts. The first cites its passage; the second had nothing to cite and says so."
    >
      <div className="space-y-3">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-3.5 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="font-mono text-[0.6875rem] text-muted-foreground">AC-04 · Access control</p>
              <p className="mt-0.5 text-sm font-medium">Do you enforce MFA for all administrative access?</p>
            </div>
            <StatusChip status="drafted" />
          </div>
          <div className="space-y-3 px-3.5 py-3.5 sm:px-4">
            <p className="text-[0.875rem] leading-relaxed">
              Yes. Multi-factor authentication is required for all administrative and privileged access to
              production systems and cloud consoles.
              <Cite n={1} />
            </p>
            <div className="passage text-[0.8125rem] leading-relaxed text-ink">
              <p className="flex items-center gap-1.5">
                <Cite n={1} />
                <span className="sr-only">Source: </span>
                <HeadingPath parts={["Access Control Policy", "4.2 Multi-factor authentication"]} className="text-ink/80" />
              </p>
              <p className="mt-1.5">
                &ldquo;Multi-factor authentication is required for all administrative and privileged access to
                production systems, cloud consoles and the identity provider.&rdquo;
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-[0.8125rem]">
              <span className="text-muted-foreground">Confidence</span>
              <Confidence value={0.91} />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-3.5 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="font-mono text-[0.6875rem] text-muted-foreground">IN-01 · Insurance</p>
              <p className="mt-0.5 text-sm font-medium">What are the coverage limits of your cyber insurance policy?</p>
            </div>
            <StatusChip status="needs_evidence" />
          </div>
          <div className="space-y-3 px-3.5 py-3.5 sm:px-4">
            <p className="text-[0.875rem] text-muted-foreground italic">No draft. No retrieved passage supports an answer.</p>
            <p className="border-l-2 border-amber pl-3 text-[0.8125rem] leading-relaxed">
              <span className="font-medium">Would be answered by:</span> an insurance summary naming the carrier,
              cyber coverage limits and renewal date.
            </p>
            <div className="flex flex-wrap gap-2">
              <FauxButton>Answer by hand</FauxButton>
              <FauxButton>Assign as task</FauxButton>
              <FauxButton tone="ghost">Not applicable</FauxButton>
            </div>
          </div>
        </Panel>
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------------- Step 4 */

export function ReviewExportMock() {
  return (
    <Figure number="5" caption="Approve, export, and keep the answer for next time.">
      <div className="space-y-3">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-3.5 py-3 sm:px-4">
            <p className="min-w-0 text-sm font-medium">
              <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground">AC-09 </span>
              How often are user access rights reviewed?
            </p>
            <StatusChip status="approved" />
          </div>
          <div className="px-3.5 py-3.5 sm:px-4">
            <p className="text-[0.875rem] leading-relaxed">
              Quarterly. System owners review every account with production access and remove access that is no
              longer needed.
              <Cite n={3} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FauxButton tone="primary">
                Approve <Kbd>A</Kbd>
              </FauxButton>
              <FauxButton>
                Edit <Kbd>E</Kbd>
              </FauxButton>
              <FauxButton tone="ghost">Not applicable</FauxButton>
            </div>
            <p className="mt-3 font-mono text-[0.6875rem] text-muted-foreground">
              Approved by m.okafor · added to the answer library
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Export" meta="133 approved · 9 open" />
          <ul className="divide-y divide-border text-[0.8125rem]">
            <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-3 sm:px-4">
              <div className="min-w-0">
                <p className="font-medium">XLSX, round-trip</p>
                <p className="mt-0.5 text-muted-foreground">
                  Export XLSX keeps the customer&rsquo;s workbook: answers go into column E, every other cell and
                  style is left as it was.
                </p>
                <p className="mt-1 font-mono text-[0.6875rem] break-all text-muted-foreground">
                  halcyon-vendor-assessment-attestly.xlsx
                </p>
              </div>
              <FauxButton tone="primary">Download</FauxButton>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-3 sm:px-4">
              <p className="font-medium">CSV</p>
              <FauxButton>Download</FauxButton>
            </li>
          </ul>
        </Panel>
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------- Principle log */

export function GuardrailLogMock() {
  return (
    <Figure number="6" caption="The checks run after the model returns, before a draft reaches the grid. Excerpt from the event log.">
      <Panel>
        <PanelHeader title="agent_events" meta="prompt draft-v3" />
        <div className="space-y-4 px-3.5 py-3.5 sm:px-4">
          <div>
            <p className="font-mono text-[0.6875rem] text-foreground">
              AC-04 <span className="text-muted-foreground">· 8 passages retrieved · 2 citations returned</span>
            </p>
            <ul className="mt-1.5 space-y-0.5" aria-label="Checks for AC-04">
              <CheckLine ok>citation c_14 in retrieved set</CheckLine>
              <CheckLine ok>citation c_52 in retrieved set</CheckLine>
              <CheckLine ok>quotes found in cited passages</CheckLine>
              <CheckLine ok>opens with &ldquo;Yes&rdquo;</CheckLine>
            </ul>
            <p className="mt-1.5 font-mono text-[0.6875rem] text-approved">→ drafted · 2 valid citations</p>
          </div>
          <div className="border-t border-border pt-3.5">
            <p className="font-mono text-[0.6875rem] text-foreground">
              IN-01 <span className="text-muted-foreground">· 8 passages retrieved · 1 citation returned</span>
            </p>
            <ul className="mt-1.5 space-y-0.5" aria-label="Checks for IN-01">
              <CheckLine ok>citation c_31 in retrieved set</CheckLine>
              <CheckLine ok={false}>quote found in c_31</CheckLine>
            </ul>
            <p className="mt-1.5 font-mono text-[0.6875rem] text-amber-foreground">
              → needs evidence · 0 valid citations
            </p>
          </div>
        </div>
      </Panel>
    </Figure>
  );
}

/* ----------------------------------------------------------- Knowledge gaps */

const gaps = [
  { topic: "Cyber insurance", count: 3, next: "Insurance summary: carrier, limits, renewal date" },
  { topic: "Physical security", count: 2, next: "Office and data-centre security statement" },
  { topic: "HIPAA", count: 1, next: "HIPAA applicability statement, or mark not applicable" },
];

export function KnowledgeGapsMock() {
  const max = Math.max(...gaps.map((g) => g.count));
  return (
    <Figure number="7" caption="Knowledge gaps on the dashboard: open needs-evidence questions, grouped by topic.">
      <Panel>
        <PanelHeader title="Knowledge gaps" meta="top 3 of 5 topics" />
        <ol className="divide-y divide-border">
          {gaps.map((g) => (
            <li key={g.topic} className="px-3.5 py-3 sm:px-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{g.topic}</p>
                <p className="tabular shrink-0 font-mono text-xs text-amber-foreground">
                  {g.count} {g.count === 1 ? "question" : "questions"}
                </p>
              </div>
              <span aria-hidden="true" className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-amber" style={{ width: `${(g.count / max) * 100}%` }} />
              </span>
              <p className="mt-2 text-[0.8125rem] text-muted-foreground">
                <span className="font-mono text-[0.625rem] tracking-[0.06em] uppercase">Write next </span>
                {g.next}
              </p>
            </li>
          ))}
        </ol>
      </Panel>
    </Figure>
  );
}
