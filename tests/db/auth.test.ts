import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { findMembershipForUser, organizationNameFor, slugify } from "@/lib/auth/organization";
import { AUTH_COOKIE_PREFIX, getAuth, resetAuthForTests, trustedOrigins } from "@/lib/auth/server";
import type { DbHandle } from "@/lib/db/client";
import { account, memberships, organizations, session, user } from "@/lib/db/schema";
import { startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
  handle = await startTestDb();
  resetAuthForTests();
}, 60_000);

afterAll(async () => {
  resetAuthForTests();
  await stopTestDb(handle);
});

describe("Better Auth on PGlite", () => {
  it("signUpEmail creates the user and, via the hook, an organization with an owner membership", async () => {
    const auth = await getAuth();
    const result = await auth.api.signUpEmail({
      body: {
        name: "Acme Security",
        email: "owner@acme-security.example",
        password: "correct horse battery",
        businessName: "Acme Security Ltd",
      },
    });
    expect(result.user.email).toBe("owner@acme-security.example");
    expect(result.token).toBeTruthy();

    const [stored] = await handle.db.select().from(user).where(eq(user.id, result.user.id));
    expect(stored).toMatchObject({ businessName: "Acme Security Ltd", emailVerified: false });

    const [credential] = await handle.db.select().from(account).where(eq(account.userId, result.user.id));
    expect(credential.providerId).toBe("credential");
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toContain("correct horse");

    const rows = await handle.db
      .select({ org: organizations, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, result.user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("owner");
    expect(rows[0].org).toMatchObject({ name: "Acme Security Ltd", plan: "free", timezone: "UTC" });
    expect(rows[0].org.slug).toMatch(/^acme-security-ltd-[a-z0-9]{6}$/);

    const sessions = await handle.db.select().from(session).where(eq(session.userId, result.user.id));
    expect(sessions).toHaveLength(1);
  });

  it("names the organization after the email local part when no business name is given", async () => {
    const auth = await getAuth();
    const result = await auth.api.signUpEmail({
      body: { name: "Anna", email: "anna.shop@example.com", password: "another long password" },
    });
    const membership = await findMembershipForUser(handle.db, result.user.id);
    expect(membership?.org.name).toBe("anna.shop");
    expect(membership?.org.slug).toMatch(/^anna-shop-[a-z0-9]{6}$/);
    expect(membership?.role).toBe("owner");
  });

  it("rejects short passwords and duplicate emails", async () => {
    const auth = await getAuth();
    await expect(
      auth.api.signUpEmail({ body: { name: "Short", email: "short@example.com", password: "123456789" } }),
    ).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });
    await expect(
      auth.api.signUpEmail({
        body: { name: "Dup", email: "owner@acme-security.example", password: "correct horse battery" },
      }),
    ).rejects.toMatchObject({ body: { code: expect.stringMatching(/^USER_ALREADY_EXISTS/) } });
  });

  it("signs in with the password and resolves the session from the cookie", async () => {
    const auth = await getAuth();
    const response = await auth.api.signInEmail({
      body: { email: "owner@acme-security.example", password: "correct horse battery" },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const setCookie = response.headers.getSetCookie();
    const tokenCookie = setCookie.find((c) => c.startsWith("attestly.session_token="));
    expect(tokenCookie).toBeTruthy();

    const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
    const current = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) });
    expect(current?.user.email).toBe("owner@acme-security.example");
    expect((current?.user as { businessName?: string }).businessName).toBe("Acme Security Ltd");

    await expect(
      auth.api.signInEmail({ body: { email: "owner@acme-security.example", password: "wrong password!!" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_EMAIL_OR_PASSWORD" } });
  });
});

describe("organization naming", () => {
  it("prefers the business name, falls back to the email local part", () => {
    expect(organizationNameFor({ email: "a@b.c", businessName: "  Boutique Verte " })).toBe("Boutique Verte");
    expect(organizationNameFor({ email: "jean.dupont@b.c", businessName: "   " })).toBe("jean.dupont");
    expect(organizationNameFor({ email: "x@b.c", businessName: 42 })).toBe("x");
  });

  it("slugifies to lower-case ASCII", () => {
    expect(slugify("Acme Security Ltd")).toBe("acme-security-ltd");
    expect(slugify("Grüner Laden GmbH")).toBe("gruner-laden-gmbh");
    expect(slugify("  Café & Co.  ")).toBe("cafe-co");
    expect(slugify("日本")).toBe("");
  });
});

describe("auth config", () => {
  it("uses the attestly cookie prefix and trusts the app URL plus localhost", () => {
    expect(AUTH_COOKIE_PREFIX).toBe("attestly");
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://attestly.example.com/some/path";
    try {
      const origins = trustedOrigins();
      expect(origins).toEqual(expect.arrayContaining(["https://attestly.example.com", "http://localhost:3000"]));
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  });
});
