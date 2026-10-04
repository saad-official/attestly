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
