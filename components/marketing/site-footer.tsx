import Link from "next/link";
import { cn } from "cn";
import { container, focusRing, links } from "./site";
import { Wordmark } from "./wordmark";

const footLink = cn("text-sm text-foreground/80 underline-offset-4 hover:text-foreground hover:underline", focusRing);
const footHeading = "font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-foreground/15 bg-card">
      <div className={cn(container, "grid gap-10 py-12 md:grid-cols-12 md:py-16")}>
        <div className="md:col-span-5">
          <Wordmark />
          <p className="mt-4 max-w-xs text-base leading-snug">Security questionnaires, answered with citations.</p>
          <p className="mt-6 max-w-sm border-l-2 border-amber pl-3 text-sm leading-relaxed text-muted-foreground">
            Demo project: Stripe runs in test mode and no real payments are taken.
          </p>
        </div>

        <nav aria-label="Product" className="md:col-span-3 md:col-start-7">
          <h2 className={footHeading}>Product</h2>
          <ul className="mt-3 space-y-2.5">
            <li>
              <Link href={links.howItWorks} className={footLink}>
                How it works
              </Link>
            </li>
            <li>
              <Link href={links.pricing} className={footLink}>
                Pricing
              </Link>
            </li>
            <li>
              <Link href={links.signIn} className={footLink}>
                Sign in
              </Link>
            </li>
            <li>
              <Link href={links.signUp} className={footLink}>
                Start free
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Project" className="md:col-span-3">
          <h2 className={footHeading}>Project</h2>
          <ul className="mt-3 space-y-2.5">
            <li>
              <a href={links.repo} className={footLink}>
                Source on GitHub
              </a>
            </li>
            <li>
              <a href={links.series} className={footLink}>
                Built in public as part of the Vibe Build Series
              </a>
            </li>
            <li>
              <Link href={links.privacy} className={footLink}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href={links.terms} className={footLink}>
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className={cn(container, "py-5 text-xs text-muted-foreground")}>
          © 2026 Attestly. A portfolio demo. Companies, policies and questionnaires in the product examples are
          fictional.
        </p>
      </div>
    </footer>
  );
}
