import Link from "next/link";
import { cn } from "cn";
import { focusRing, links, textLink } from "./site";

const items: { q: string; a: React.ReactNode }[] = [
  {
    q: "Does it make things up?",
    a: (
      <>
        <p>
          It is built not to. The model only sees passages retrieved from your own documents and past answers, and it
          is told to make no claim those passages do not support. Then plain rules check what it returned: every
          citation must point at a retrieved passage, and every quote must appear in that passage. A draft left with
          no valid citation is shown as needs evidence, never as an answer.
        </p>
        <p>
          A model can still read a passage too generously. That is why nothing leaves Attestly until a person approves
          it, and the cited passage is always one click from the answer.
        </p>
      </>
    ),
  },
  {
    q: "Which file types?",
    a: (
      <>
        <p>
          Policies: PDF, DOCX, Markdown or plain text up to 10 MB each, or pasted text. Questionnaires: XLSX or CSV,
          including multi-sheet workbooks. Past questionnaires to seed the answer library: XLSX or CSV with a question
          column and an answer column.
        </p>
        <p>Word-format questionnaires and portal submissions such as OneTrust or Whistic are not supported yet.</p>
      </>
    ),
  },
  {
    q: "What happens to questions you can’t answer?",
    a: (
      <>
        <p>
          They are marked needs evidence, with a one-line note of the document that would answer them. You can answer
          by hand, mark the question not applicable, or assign it as a task.
        </p>
        <p>
          Open needs-evidence questions are grouped on the dashboard as knowledge gaps, so a cluster such as
          &ldquo;Cyber insurance (3 questions)&rdquo; tells you which policy to write next.
        </p>
      </>
    ),
  },
  {
    q: "Can I reuse past questionnaires?",
    a: (
      <>
        <p>
          Yes. Import an answered questionnaire and its question and answer pairs become your answer library. Every
          answer you approve in Attestly is added to the library too, edited or not.
        </p>
        <p>
          Library answers are searched alongside your policies and cited the same way, so a reviewer can see when a
          draft leans on a past answer rather than a policy.
        </p>
      </>
    ),
  },
  {
    q: "Where is my data stored?",
    a: (
      <>
        <p>
          In the app&rsquo;s Postgres database, hosted on Neon: uploaded files, extracted text, passages with their
          embeddings, questionnaires and answers. Every row carries your organisation&rsquo;s id and every query is
          scoped by it.
        </p>
        <p>
          Passages are sent to the model provider when they are embedded or used for a draft. The{" "}
          <Link href={links.privacy} className={textLink}>
            privacy page
          </Link>{" "}
          lists each provider and what it receives.
        </p>
      </>
    ),
  },
];

/** Native disclosure list: works without JavaScript and with find-in-page. */
export function Faq({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div className="border-t border-foreground/20">
      {items.map((item, i) => (
        <details key={item.q} className="group border-b border-border">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start gap-4 py-5 [&::-webkit-details-marker]:hidden",
              focusRing,
            )}
          >
            <span aria-hidden="true" className="tabular mt-0.5 w-6 shrink-0 font-mono text-xs text-evergreen">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Heading className="min-w-0 flex-1 text-lg leading-snug font-medium">{item.q}</Heading>
            {/* Plus that turns into a minus: two hairlines, no icon font. */}
            <span aria-hidden="true" className="relative mt-1.5 size-3 shrink-0">
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/60" />
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/60 group-open:hidden" />
            </span>
          </summary>
          <div className="max-w-2xl space-y-3 pb-6 pl-10 text-[0.9375rem] leading-relaxed text-foreground/85">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
