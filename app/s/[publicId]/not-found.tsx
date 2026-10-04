import Link from "next/link";

export default function SharedReviewNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Link unavailable</p>
      <h1 className="font-heading text-2xl">This review link has expired or was revoked</h1>
      <p className="text-sm text-muted-foreground">
        Shared reviews are available for a limited time. Ask the person who sent it for a new link.
      </p>
      <Link href="/" className="mt-2 text-sm font-medium text-evergreen underline-offset-3 hover:underline">
        About Attestly
      </Link>
    </main>
  );
}
