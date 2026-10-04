"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { createShareLinkAction, revokeShareLinkAction } from "@/app/(app)/questionnaires/actions";
import { formatDateTime } from "@/components/dashboard/format";
import { FormMessage } from "@/components/dashboard/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ShareLinkView = { id: string; path: string; expiresAt: Date; expired: boolean };

const DAYS = [7, 14, 30, 90];

const subscribeNoop = () => () => {};

/** The page's origin on the client ("" during server rendering). */
function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy. Select the link and copy it instead.");
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * Read-only share links (Pro): create one valid for N days, copy it, revoke
 * it. On Free the dialog explains the feature and links to billing.
 */
export function ShareDialog({
  questionnaireId,
  allowed,
  links,
  timeZone,
}: {
  questionnaireId: string;
  allowed: boolean;
  links: ShareLinkView[];
  timeZone: string;
}) {
  const origin = useOrigin();
  const [days, setDays] = useState(14);
  const [error, setError] = useState<{ message: string; upgradeUrl?: string } | null>(null);
  const [creating, startCreate] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [, startRevoke] = useTransition();
  const active = links.filter((l) => !l.expired);

  function create() {
    setError(null);
    startCreate(async () => {
      const result = await createShareLinkAction(questionnaireId, days);
      if (!result.ok) {
        setError({ message: result.error, upgradeUrl: result.upgradeUrl });
        return;
      }
      if (result.data) {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${result.data.path}`);
          toast.success("Share link created and copied.");
        } catch {
          toast.success("Share link created.");
        }
      }
    });
  }

  function revoke(id: string) {
    setError(null);
    setRevoking(id);
    startRevoke(async () => {
      const result = await revokeShareLinkAction(questionnaireId, id);
      setRevoking(null);
      if (!result.ok) setError({ message: result.error });
      else toast.success("Share link revoked.");
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 aria-hidden />
          Share{active.length > 0 ? <span className="tabular font-mono text-xs text-muted-foreground">{active.length}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Share a read-only review</DialogTitle>
          <DialogDescription>
            Anyone with the link sees the questions, answers and cited passages. No sign-in, no editing, hidden from search
            engines. Links expire.
          </DialogDescription>
        </DialogHeader>

        {!allowed ? (
          <div className="grid gap-3 rounded-lg border border-dashed p-3 text-sm">
            <p>Shareable review links are a Pro feature.</p>
            <Button asChild size="sm" className="justify-self-start">
              <Link href="/billing">See plans</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="share-days" className="text-xs">
                  Valid for
                </Label>
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                  <SelectTrigger id="share-days" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={create} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                Create link
              </Button>
            </div>
            <FormMessage error={error?.message} upgradeUrl={error?.upgradeUrl} />

            {links.length > 0 ? (
              <ul className="grid gap-2">
                {links.map((link) => {
                  const url = `${origin}${link.path}`;
                  return (
                    <li key={link.id} className={cn("grid gap-2 rounded-lg border p-2.5", link.expired && "opacity-60")}>
                      <input
                        readOnly
                        value={url}
                        aria-label="Share link"
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full truncate rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {link.expired ? "Expired" : "Expires"} {formatDateTime(link.expiresAt, timeZone)}
                        </span>
                        <span className="flex gap-1.5">
                          {link.expired ? null : <CopyButton url={url} />}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => revoke(link.id)}
                            disabled={revoking === link.id}
                          >
                            {revoking === link.id ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
                            Revoke
                          </Button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No share links yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
