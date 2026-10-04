/**
 * Shared PGlite setup for database tests. Each test file calls `vi.mock("server-only")`
 * itself (vi.mock is hoisted per file), then `startTestDb()` in beforeAll.
 */
import type { SQL } from "drizzle-orm";
import { createPgliteDb, setDbHandle, type DbHandle } from "@/lib/db/client";
import { EMBEDDING_DIMENSIONS, organizations } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/types";

/** Fresh in-memory PGlite (with pgvector) with every migration in drizzle/ applied, wired into getDb(). */
export async function startTestDb(): Promise<DbHandle> {
  const handle = await createPgliteDb(undefined);
  setDbHandle(handle);
  return handle;
}

export async function stopTestDb(handle: DbHandle | undefined): Promise<void> {
  setDbHandle(null);
  await handle?.close();
}

let orgCounter = 0;

export async function insertOrg(handle: DbHandle, name = "Test Co"): Promise<Organization> {
  orgCounter += 1;
  const [org] = await handle.db
    .insert(organizations)
    .values({ name, slug: `test-co-${orgCounter}-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  return org;
}

/**
 * Deterministic fake 768-dim embedding pointing mostly along `axis`, with an
 * optional pull towards `towards` (0..1). Cosine distance between two such
 * vectors is controlled by the axes and the pull, so tests can assert ranking.
 */
export function fakeEmbedding(axis: number, towards?: { axis: number; weight: number }): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[axis % EMBEDDING_DIMENSIONS] = 1;
  if (towards) v[towards.axis % EMBEDDING_DIMENSIONS] += towards.weight;
  // A little shared noise so no two vectors are exactly orthogonal.
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 97) v[i] += 0.01;
  return v;
}

/** Raw SQL through the PGlite client (the driver-agnostic Db type leaves execute() results untyped). */
export async function queryRows<T>(handle: DbHandle, query: SQL): Promise<T[]> {
  const result = (await handle.db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

/** The Postgres error message behind a rejected query (Drizzle wraps it in `cause`). */
export async function dbErrorMessage(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : String(error);
  }
  throw new Error("expected the query to be rejected");
}
