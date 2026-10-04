import type { Priority, ProjectStage, WorkStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { humanize } from "@/lib/format";

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
