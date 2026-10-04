# Attestly

**Security questionnaires, answered with citations.** Upload your policies and the customer's spreadsheet. Attestly drafts every answer from your own documents with a citation to the exact passage, flags questions that have no evidence as tasks, lets you review and edit in a dense grid, and writes the answers back into the original workbook. Approved answers feed an answer library, so the next questionnaire starts further ahead.

Part of the [Vibe Build Series](https://github.com/saad-official/vibe-build-series): real products for small businesses, built in public on free tiers.

## Why

Small SaaS vendors spend 20–40 hours on each enterprise security questionnaire, and most say security reviews delay deals by two weeks or more. The tools that automate this are sold as annual compliance-platform contracts. Attestly is the small-team version: your documents, your answers, a flat price.

**Every answer cites its source or says it has none.** The model writes; deterministic guardrails verify that each citation exists and each quote appears in the cited passage. Drafts without valid citations are downgraded to "needs evidence".

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Neon Postgres with pgvector · Drizzle ORM · Better Auth · Vercel AI SDK 7 with Groq (drafting) and Gemini (embeddings, fallback) · ExcelJS · Stripe (test mode) · Vitest · Vercel

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # leave DATABASE_URL empty to use embedded PGlite
pnpm dev
```

## Docs

- [Spec](docs/spec.md) · [Plan](docs/plan.md)

## Live demo

https://tryattestly.vercel.app · Stripe runs in test mode (card `4242 4242 4242 4242`).

1. Sign up (no card). On the empty dashboard, click **Load demo workspace**: six synthetic policies for the fictional "Northbeam Software" are chunked and embedded, and a 40-question "Acme Corp" questionnaire is created.
2. The review page starts drafting in batches (Groq `gpt-oss-20b`, 15 questions per batch, paused and resumed from the page). Each draft carries a confidence and numbered citations; click a citation to see the exact passage with the quoted sentence highlighted.
3. Questions with no supporting passage become **Needs evidence** tasks; the dashboard groups them into knowledge gaps (the policy to write next).
4. Approve one answer at a time (A / E / Enter shortcuts) or **Approve N** above a confidence threshold. Approved answers join the answer library and are reused on the next questionnaire.
5. Export as CSV on Free. XLSX round-trip into the customer's original workbook, read-only share links and team notes are Pro.

Verified end to end on 4 Oct 2026 against the production Neon database: 40 questions drafted, 24 approved, cron and Stripe webhook routes answer correctly.

## Known gaps

- Bulk approve is sequential (about 3 s per answer on Neon); a batched update is the next optimisation.
- Groq's free tier (30 requests and 8K tokens a minute) makes a full 40-question draft take several minutes; the runner shows progress and can be paused.
- Share links and XLSX export need the Pro plan, so the public share page is only reachable after a test-mode checkout.
