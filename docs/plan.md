# Attestly — implementation plan

Reuses the Drizzle + Better Auth plumbing from Conformly. Each phase ends with passing checks and a commit.

## Phase 0 — Foundation
- [x] Scaffold, identity (Inter Tight + Inter + Fira Code; evergreen / amber / approved), spec, README
- [x] Neon project, Vercel project (tryattestly.vercel.app), Stripe product ($49/month), base env vars

## Phase 1 — Data layer
- [ ] Schema in Postgres schema `attestly` with pgvector (768-dim), HNSW + GIN indexes, append-only agent_events
- [ ] Repositories, Better Auth, PGlite with the vector extension for local dev and tests

## Phase 2 — Core (pure, injectable)
- [ ] Ingest: text extraction (PDF, DOCX, Markdown, text), heading-aware chunking
- [ ] RAG: Gemini embeddings (768), reciprocal-rank-fusion merge of vector, keyword and library hits
- [ ] Draft: prompt, Zod schema, deterministic citation guardrails
- [ ] Sheets: mapping detection, question reading, XLSX write-back, CSV
- [ ] Demo: six synthetic policies, a 40-question questionnaire, a 12-answer library

## Phase 3 — Services and screens
- [ ] Knowledge base (upload, index, re-index, delete), Library, Questionnaires (upload → mapping preview → draft batches → review grid → export), Dashboard with knowledge gaps, Settings, Billing
- [ ] API: draft batch route, export route, share links, cron daily, Stripe webhook

## Phase 4 — Ship
- [ ] Marketing site, deploy, env script, end-to-end verification with the demo workspace
