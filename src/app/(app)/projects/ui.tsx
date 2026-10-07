import Link from "next/link";
import type { Priority, ProjectStage, WorkStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { taskHealth, type TaskHealth } from "@/lib/projects";
import { formatSize } from "@/lib/project-files";
import { deleteProjectFile } from "./actions";

const STAGES: ProjectStage[] = ["CREATE", "ASSIGN", "PLAN", "EXECUTE", "REVIEW", "APPROVAL", "HANDOVER", "COMPLETE"];

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-brand-50 ${className}`}>
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} />
    </div>
  );
}

/** The eight-step project flow from the Floot prototype, with the current step highlighted. */
export function StageRail({ stage }: { stage: ProjectStage }) {
  const current = STAGES.indexOf(stage);
  return (
    <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {STAGES.map((s, i) => {
        const done = i < current || stage === "COMPLETE";
        const active = i === current && stage !== "COMPLETE";
        return (
          <li key={s} className="flex flex-col items-center gap-1 text-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-brand-600 text-white"
                  : active
                    ? "bg-white text-brand-700 ring-2 ring-brand-600"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? "✓" : String(i + 1).padStart(2, "0")}
            </span>
            <span className={`text-xs ${active ? "font-semibold text-brand-800" : done ? "text-slate-700" : "text-slate-400"}`}>
              {humanize(s)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const stageColor: Record<ProjectStage, "gray" | "blue" | "green" | "amber" | "purple"> = {
  CREATE: "gray",
  ASSIGN: "gray",
  PLAN: "blue",
  EXECUTE: "blue",
  REVIEW: "purple",
  APPROVAL: "amber",
  HANDOVER: "green",
  COMPLETE: "green",
};

export function StageBadge({ stage, onHold }: { stage: ProjectStage; onHold?: boolean }) {
  return (
    <>
      <Badge color={stageColor[stage]}>{humanize(stage)}</Badge>
      {onHold && (
        <>
          {" "}
          <Badge color="red">On hold</Badge>
        </>
      )}
    </>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "LOW") return <Badge>Low</Badge>;
  return <Badge color={priority === "HIGH" ? "red" : "amber"}>{humanize(priority)}</Badge>;
}

const workColor: Record<WorkStatus, "gray" | "blue" | "purple" | "green"> = {
  TODO: "gray",
  IN_PROGRESS: "blue",
  REVIEW: "purple",
  DONE: "green",
};

export function WorkBadge({ status }: { status: WorkStatus }) {
  return <Badge color={workColor[status]}>{status === "TODO" ? "To do" : humanize(status)}</Badge>;
}

export const WORK_STATUSES: WorkStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

// ─── From Task Flow: status chart, overdue badge, files and the updates feed ──

const HEALTH: { key: TaskHealth; label: string; color: string }[] = [
  { key: "TODO", label: "To do", color: "#94a3b8" },
  { key: "IN_PROGRESS", label: "In progress", color: "#0b6b5b" },
  { key: "REVIEW", label: "Review", color: "#8b5cf6" },
  { key: "DONE", label: "Done", color: "#4aa28a" },
  { key: "OVERDUE", label: "Overdue", color: "#dc2626" },
];

/** Task Flow's "Project status overview" ring: tasks by status, with overdue split out. */
export function StatusRing({ counts }: { counts: Record<TaskHealth, number> }) {
  const total = HEALTH.reduce((s, h) => s + counts[h.key], 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Tasks by status">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f0" strokeWidth="18" />
        {total > 0 &&
          HEALTH.filter((h) => counts[h.key] > 0).map((h) => {
            const len = (counts[h.key] / total) * c;
            const el = (
              <circle
                key={h.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={h.color}
                strokeWidth="18"
                strokeDasharray={`${Math.max(len - gap, 1)} ${c}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" className="fill-slate-900 font-display text-[26px] font-semibold">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-slate-500 text-[10px]">
          tasks
        </text>
      </svg>
      <ul className="min-w-36 flex-1 space-y-1.5 text-sm">
        {HEALTH.map((h) => (
          <li key={h.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
              {h.label}
            </span>
            <span className="font-semibold tabular-nums">{counts[h.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function healthCounts(tasks: { status: string; dueDate: Date | null }[], today: Date) {
  const counts: Record<TaskHealth, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, OVERDUE: 0 };
  for (const t of tasks) counts[taskHealth(t, today)]++;
  return counts;
}

/** Work status badge that shows "Overdue" for an open task past its due date. */
export function TaskStatusBadge({ status, dueDate, today }: { status: WorkStatus; dueDate: Date | null; today: Date }) {
  if (taskHealth({ status, dueDate }, today) === "OVERDUE") return <Badge color="red">Overdue</Badge>;
  return <WorkBadge status={status} />;
}

export function UpdateRequestedBadge() {
  return <Badge color="amber">Update requested</Badge>;
}

type FileRow = {
  id: string;
  fileName: string;
  size: number;
  createdAt: Date;
  uploadedById: string;
  uploadedBy?: { name: string } | null;
};

/** Files with links that open (PDFs, images) or download (anything else). The uploader or the project owner can delete. */
export function FileList({ files, canDelete }: { files: FileRow[]; canDelete?: (f: FileRow) => boolean }) {
  if (files.length === 0) return <p className="text-sm text-slate-500">No files yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {files.map((f) => {
        const del = canDelete?.(f) ? deleteProjectFile.bind(null, f.id) : null;
        return (
          <li key={f.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a href={`/api/project-files/${f.id}`} target="_blank" rel="noreferrer" className="link block truncate">
                📎 {f.fileName}
              </a>
              <div className="text-xs text-slate-500">
                {formatSize(f.size)}
                {f.uploadedBy && ` · ${f.uploadedBy.name}`} · {formatDate(f.createdAt)}
              </div>
            </div>
            {del && (
              <form action={del}>
                <button className="text-xs text-slate-400 hover:text-red-600" title="Delete file">
                  ✕
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type UpdateRow = {
  id: string;
  note: string | null;
  progressFrom: number | null;
  progressTo: number | null;
  statusTo: WorkStatus | null;
  isRequest: boolean;
  createdAt: Date;
  author: { name: string };
  task?: { id: string; title: string } | null;
  files: { id: string; fileName: string }[];
};

/** Task Flow's "Reports & updates": who reported what, newest first. */
export function UpdateFeed({ updates, projectId, showTask = false }: { updates: UpdateRow[]; projectId: string; showTask?: boolean }) {
  if (updates.length === 0) return <p className="text-sm text-slate-500">No updates yet.</p>;
  return (
    <ul className="space-y-3">
      {updates.map((u) => (
        <li key={u.id} className={`rounded-xl p-3 text-sm ${u.isRequest ? "bg-amber-50" : "bg-slate-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              <b className="text-slate-800">{u.author.name}</b>
              {u.isRequest ? " asked for an update" : " posted an update"}
              {showTask && u.task && (
                <>
                  {" on "}
                  <Link href={`/projects/${projectId}/tasks/${u.task.id}`} className="link">
                    {u.task.title}
                  </Link>
                </>
              )}
            </span>
            <span>{formatDateTime(u.createdAt)}</span>
          </div>
          {(u.progressTo !== null || u.statusTo) && (
            <div className="mt-1 text-xs font-medium text-brand-700">
              {u.progressTo !== null && `Progress ${u.progressFrom ?? 0}% → ${u.progressTo}%`}
              {u.progressTo !== null && u.statusTo && " · "}
              {u.statusTo && `Now ${u.statusTo === "TODO" ? "to do" : humanize(u.statusTo).toLowerCase()}`}
            </div>
          )}
          {u.note && <p className="mt-1 whitespace-pre-line text-slate-700">{u.note}</p>}
          {u.files.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {u.files.map((f) => (
                <a key={f.id} href={`/api/project-files/${f.id}`} target="_blank" rel="noreferrer" className="link text-xs">
                  📎 {f.fileName}
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export const updateInclude = {
  author: { select: { name: true } },
  task: { select: { id: true, title: true } },
  files: { select: { id: true, fileName: true } },
} as const;
