import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { links, textLink } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms for the Attestly portfolio demo: synthetic data only, drafts you must review before use, Stripe in test mode, no warranty. Not legal advice.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage label="Terms" title="Terms of use" updated="2026-10-04">
      <h2>What this is</h2>
      <p>
        Attestly is a portfolio demo built in public as part of the{" "}
        <a href={links.series} className={textLink}>
          Vibe Build Series
        </a>
        . It shows how a security-questionnaire responder could work. It is not a commercial service, and there is no
        contract, support commitment or uptime promise behind it.
      </p>

      <h2>Use synthetic data</h2>
      <ul>
        <li>Use the demo workspace, or documents you have invented for the purpose.</li>
        <li>
          Do not upload real security policies, real customer questionnaires, personal data or anything you are bound
          to keep confidential.
        </li>
        <li>Do not use the demo to process data on behalf of anyone else.</li>
      </ul>

      <h2>Drafts are drafts</h2>
      <p>
        Every answer Attestly produces is a draft for a person to review. Citations show which passage a draft rests
        on; they do not make the draft correct, complete or true of your company. You are responsible for any answer
        you approve, export or send to a customer.
      </p>
      <p>
        Attestly does not assess your security, certify compliance with any framework, or give legal advice.
      </p>

      <h2>Payments</h2>
      <p>
        The Pro plan runs through Stripe in test mode. No real card is charged and no real payment is taken. Test-mode
        subscriptions may be cancelled or reset at any time.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to read another organisation&rsquo;s data, or to get around plan limits or rate limits.</li>
        <li>Do not upload malware or files built to break the document parsers.</li>
        <li>Accounts that misuse the demo may be removed without notice.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The demo is provided as is, without warranty of any kind. Data may be reset or deleted at any time, so keep
        your own copies of anything you care about.
      </p>

      <h2>Related</h2>
      <p>
        How data is handled is described on the{" "}
        <Link href={links.privacy} className={textLink}>
          privacy page
        </Link>
        . The source code is on{" "}
        <a href={links.repo} className={textLink}>
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}
