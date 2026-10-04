import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { links, textLink } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How the Attestly demo handles data: documents and answers in a Postgres database scoped per organisation, embeddings as vectors, logged model calls, synthetic demo data, and no real payments. Not legal advice.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage label="Privacy" title="Privacy" updated="2026-10-04">
      <h2>The short version</h2>
      <p>
        Attestly is a portfolio demo. It is built to run on the synthetic demo workspace: six invented policies and a
        generated questionnaire. Please do not upload real security policies, real customer questionnaires or anything
        confidential to the public demo.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>Your account: email address and a password hash, managed by Better Auth in the app&rsquo;s database.</li>
        <li>Your organisation: its name, plan and members.</li>
        <li>
          Documents you upload, as the original file and its extracted text, split into passages. Each passage is
          stored with an embedding: a list of 768 numbers used for search.
        </li>
        <li>
          Questionnaires you upload, as the original workbook and one row per question, with drafts, citations,
          confidence, notes and who approved what.
        </li>
        <li>Your answer library: question and answer pairs you imported or approved.</li>
        <li>
          A log of every model call: the model, the prompt version, token counts and latency.
        </li>
      </ul>
      <p>
        All of it lives in a Postgres database hosted on Neon. Every row carries your organisation&rsquo;s id, and
        every query is scoped by it.
      </p>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Neon</strong> hosts the database.
        </li>
        <li>
          <strong>Google Gemini</strong> creates embeddings of passages and questions, and drafts answers when the
          primary model is unavailable. The demo workspace uses the free tier, whose inputs Google may use to improve
          its products. That is why the demo runs on invented policies, and why you should bring your own key before
          uploading your own.
        </li>
        <li>
          <strong>Groq</strong> drafts answers from the passages retrieved for each question.
        </li>
        <li>
          <strong>Stripe</strong> runs checkout in test mode. No real card is charged and no real payment is taken.
        </li>
        <li>
          <strong>Resend</strong> delivers email only when demo delivery is switched on. By default, outgoing email is
          kept in an in-app outbox and is not sent.
        </li>
        <li>
          <strong>Vercel</strong> hosts the site and records anonymous page-view analytics.
        </li>
      </ul>

      <h2>What is not done</h2>
      <ul>
        <li>Attestly does not train or fine-tune any model on your documents or answers.</li>
        <li>Data is not sold or shared for advertising.</li>
        <li>Nothing is written to a customer&rsquo;s workbook until you approve the answer and export it yourself.</li>
      </ul>

      <h2>Share links</h2>
      <p>
        On Pro you can create a read-only review link. Anyone with the link can read that questionnaire&rsquo;s
        questions and answers until it expires. Share links are marked so search engines do not index them, and
        expired links are purged daily.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Demo data may be reset at any time. To have an account and its data removed sooner, open an issue on the{" "}
        <a href={links.issues} className={textLink}>
          GitHub repository
        </a>{" "}
        without including any personal details, and the maintainer will follow up.
      </p>

      <h2>Related</h2>
      <p>
        The rules for using the demo are on the{" "}
        <Link href={links.terms} className={textLink}>
          terms page
        </Link>
        .
      </p>
    </LegalPage>
  );
}
