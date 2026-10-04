# Attestly — product and technical spec

Status: approved design, 2026-10-04. App 4 of the [Vibe Build Series](https://github.com/saad-official/vibe-build-series).

## 1. Problem

Every enterprise deal a small SaaS, agency or MSP closes comes with a security questionnaire: a 100–300 row spreadsheet (SIG Lite, CAIQ, or the customer's own) that a founder or CTO fills in by hand from memory and old answers. Vendors report 20–40 hours per comprehensive questionnaire and 72% say security reviews delay deals by two weeks or more. Loopio, Responsive, Conveyor and Vanta's questionnaire automation are sold as annual contracts bundled with compliance platforms; tiny teams answer in Google Sheets.

Attestly turns the company's own policies and past answers into a knowledge base, drafts every answer with citations to the exact passage, flags questions with no evidence as tasks, lets a reviewer accept or edit each answer, and writes the answers back into the customer's original spreadsheet. Edits flow back into the answer library, so the next questionnaire starts further ahead.

**Principle: every answer cites its source or says it has none.** No uncited claim is ever presented as a draft.

## 2. Users and plans

- **Owner / reviewer** at a 2–50 person company that sells to enterprises.
- **Free:** 1 questionnaire a month (up to 100 questions), 25 policy pages, review grid, CSV export, demo workspace.
- **Pro ($49/month, Stripe test mode):** unlimited questionnaires and pages, XLSX round-trip export preserving the customer's workbook, answer library export, shareable read-only review links, team notes.

## 3. Core flows

### 3.1 Knowledge base
Upload policy documents (PDF, DOCX, Markdown, TXT; 10 MB max) or paste text. Text extraction: PDF via `unpdf`, DOCX via `mammoth`, others as-is. Chunking: headings-aware, ~400–600 tokens with 60-token overlap, each chunk keeps `heading_path` and `position`. Embeddings via Gemini's embedding model through the AI SDK (free tier), stored in Postgres `vector` (pgvector on Neon). Documents can be re-indexed; superseded versions are kept for citations in old answers.

Past questionnaires (XLSX/CSV with question and answer columns) can be imported into the **answer library**: `(question, answer, source, approved_at)` pairs, embedded on the question text.

### 3.2 Questionnaire intake
Upload XLSX or CSV. Parsing (ExcelJS): pick the sheet with the most text cells, detect the header row (first row where ≥2 cells look like headers) and classify columns as `id`, `question`, `answer`, `comment`, `other` by header vocabulary plus content heuristics; the user confirms the mapping in a preview. Rows become `questions` with their sheet, row and column coordinates so answers can be written back to the exact cells. Sections (merged header rows or short all-caps rows) become `section` labels.

### 3.3 Drafting (agent)
Runs in batches of 15 questions per request (`/api/questionnaires/[id]/draft`, `maxDuration = 300`) and the review page polls until all rows are processed. Per question:
1. Retrieve: hybrid search over chunks (pgvector cosine top 8) and library answers (top 4), plus a BM25-style keyword pass via Postgres full-text search; merge and dedupe.
2. Draft: Groq gpt-oss-20b (Gemini fallback) with a strict schema `{ answer, status: 'drafted' | 'needs_evidence' | 'not_applicable', citations: [{ chunkId | libraryAnswerId, quote }], confidence, notes }`. Instructions forbid any claim not supported by the retrieved text; when nothing supports an answer, status must be `needs_evidence` with a one-line note of what document would answer it.
3. Guardrails (deterministic): every citation id must exist in the retrieved set; quotes must appear in the cited text (normalised); a draft with zero valid citations is downgraded to `needs_evidence`; answers longer than 1200 chars are truncated with a warning; yes/no questions get a leading Yes/No/Partially.
4. Log: `agent_events` with model, prompt version, tokens, latency.

### 3.4 Review
Grid of questions: section, question, draft, status chip (drafted / needs evidence / not applicable / approved), confidence meter, citations (hover or expand to show the source passage with heading path and document title). Actions: approve, edit then approve, mark not applicable, assign as task ("needs a policy for X"). Bulk approve above a confidence threshold. Every approved answer (edited or not) is upserted into the answer library with `source = questionnaire`. Keyboard: J/K, A, E.

### 3.5 Export
- CSV always.
- XLSX round-trip (Pro): the original workbook is loaded with ExcelJS, answers written into the mapped answer column cells (and comments column when present), styles preserved, downloaded as `<name>-attestly.xlsx`.
- Share link (Pro): read-only review page by unguessable id, `noindex`.

### 3.6 Dashboard
Questionnaires in progress with coverage (drafted / needs evidence / approved), hours saved estimate (approved answers × 4 minutes), knowledge base size (documents, chunks), library size, and **knowledge gaps**: clusters of `needs_evidence` questions (grouped by embedding similarity, labelled by the model) that tell the owner which policy to write next.

### 3.7 Demo workspace
"Load demo workspace" creates six synthetic policy documents (Information Security Policy, Access Control, Incident Response, Business Continuity & DR, Vendor Management, Data Retention & Privacy) written as realistic Markdown, indexes them, imports a 12-answer past-questionnaire library, and creates a 40-question "Acme Corp vendor security questionnaire" XLSX generated with ExcelJS, then starts drafting. Everything is labelled synthetic.

### 3.8 Billing and jobs
Stripe Checkout and Customer Portal (test mode). Daily cron purges expired share links and re-tries failed embeddings.

## 4. Data model (Postgres schema `attestly`, Drizzle)

```
organizations(id, name, slug, plan, stripe_customer_id, stripe_subscription_id, timezone, created_at)
memberships(org_id, user_id, role)
user / session / account / verification   -- Better Auth
documents(id, org_id, title, kind: policy|past_questionnaire|pasted, file_name, mime_type, size_bytes,
          original bytea null, text, status: indexing|ready|failed, chunk_count, error, created_at, updated_at)
chunks(id, document_id, org_id, position, heading_path text[], text, token_count, embedding vector(768),
       tsv tsvector generated)
library_answers(id, org_id, question, answer, source: import|questionnaire|manual, questionnaire_id null,
                question_id null, embedding vector(768), approved_at, created_at)
questionnaires(id, org_id, name, customer, file_name, mime_type, original bytea, sheet_name, header_row,
               id_col, question_col, answer_col, comment_col, status: mapping|drafting|review|done,
               question_count, drafted_count, approved_count, needs_evidence_count, public_id null, created_at)
questions(id, questionnaire_id, org_id, row_number, section, external_id, text, draft, final,
          status: pending|drafted|needs_evidence|not_applicable|approved, confidence, citations jsonb,
          retrieval jsonb, notes, reviewed_by, reviewed_at, created_at, updated_at)
share_links(id, questionnaire_id, org_id, public_id, expires_at)
outbox(...), agent_events(...)  -- as the other apps
```
Indexes: HNSW on `chunks.embedding` and `library_answers.embedding` (cosine), GIN on `chunks.tsv`, org_id everywhere. Embedding dimension 768 (request `outputDimensionality: 768` from the Gemini embedding model so the HNSW index stays small and fast).

## 5. Architecture

Next.js 16 App Router; Drizzle + postgres.js on Neon (PGlite for local dev and tests, with the `vector` extension available in PGlite via `@electric-sql/pglite/vector`); Better Auth. `lib/ingest/*` (extract, chunk), `lib/rag/*` (embed, retrieve, rerank), `lib/draft/*` (prompt, guardrails), `lib/sheets/*` (detect mapping, read, write-back), `lib/domain/*` pure helpers, `lib/services/*`. Vitest for chunking, mapping detection, guardrails, retrieval merging (with fake embeddings), and the write-back round-trip.

## 6. Design identity

Trust, precision, paper trail. Type: **Inter Tight** (headings, 600–700) + **Inter** (body) + **Fira Code** (citations, ids). Palette: ink `#17202A`, parchment `#FAF8F4`, **evergreen** `#0F5C5A` (primary, citations), moss-light `#DDEBE7` (cited passages), amber `#C7811A` (needs evidence), slate `#64707D`, approved green `#2E7D4F`. Citations render as superscript markers `[1]` in the evergreen colour that open the passage in a side panel. The review grid is dense with sticky headers; the landing page shows a real review grid with citations.

## 7. Testing

Unit: chunker (heading paths, overlap, sizes), column detection on messy fixtures, guardrails (citation validation, quote matching), hybrid merge ranking, ExcelJS write-back preserving other cells, library upsert. Integration on PGlite with the vector extension: index a document, retrieve, draft with a fake model. Playwright smoke later.

## 8. Out of scope for v1

SSO, multi-org, Word questionnaires, portal submissions (OneTrust/Whistic), fine-tuning.
