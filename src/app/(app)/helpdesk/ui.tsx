import type { TicketStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

const statusColor: Record<TicketStatus, "amber" | "blue" | "green" | "gray"> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  DONE: "green",
  CANCELLED: "gray",
};

const statusLabel: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Withdrawn",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge color={statusColor[status]}>{statusLabel[status]}</Badge>;
}

export function FileLink({ file }: { file: { id: string; fileName: string; mimeType: string; size: number } }) {
  return (
    <a
      href={`/api/helpdesk/files/${file.id}`}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs hover:border-brand-400"
    >
      <span className="font-semibold text-brand-700">{file.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
      <span className="max-w-48 truncate">{file.fileName}</span>
      <span className="text-slate-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
    </a>
  );
}
