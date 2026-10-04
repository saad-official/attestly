import Link from "next/link";
import { Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Downloads from GET /api/questionnaires/[id]/export?format=. CSV on every
 * plan; XLSX (answers written into the customer's original workbook) is Pro.
 */
export function ExportButtons({ questionnaireId, xlsxAllowed }: { questionnaireId: string; xlsxAllowed: boolean }) {
  const base = `/api/questionnaires/${questionnaireId}/export`;
  return (
    <div className="flex items-center gap-1.5">
      <Button asChild variant="outline" size="sm">
        <a href={`${base}?format=csv`} download>
          <Download aria-hidden />
          CSV
        </a>
      </Button>
      {xlsxAllowed ? (
        <Button asChild size="sm">
          <a href={`${base}?format=xlsx`} download>
            <Download aria-hidden />
            XLSX
          </a>
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm" title="XLSX export into the customer's workbook is a Pro feature">
          <Link href="/billing">
            <Lock aria-hidden />
            XLSX · Pro
          </Link>
        </Button>
      )}
    </div>
  );
}
