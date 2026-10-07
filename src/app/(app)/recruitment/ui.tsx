import type { CandidateStage, InterviewStatus, JobStatus, OfferStatus, Recommendation } from "@prisma/client";
import { Badge } from "@/components/ui";
import { humanize } from "@/lib/format";

type Color = "gray" | "blue" | "green" | "amber" | "red" | "purple";

const stageColor: Record<CandidateStage, Color> = {
  APPLIED: "gray",
  SCREENING: "blue",
  INTERVIEW: "purple",
  OFFER: "amber",
  HIRED: "green",
  REJECTED: "red",
  WITHDRAWN: "gray",
};

export function StageBadge({ stage }: { stage: CandidateStage }) {
  return <Badge color={stageColor[stage]}>{humanize(stage)}</Badge>;
}

const jobColor: Record<JobStatus, Color> = { OPEN: "green", ON_HOLD: "amber", FILLED: "blue", CLOSED: "gray" };

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge color={jobColor[status]}>{humanize(status)}</Badge>;
}

const offerColor: Record<OfferStatus, Color> = { DRAFT: "gray", SENT: "amber", ACCEPTED: "green", DECLINED: "red", WITHDRAWN: "gray" };

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <Badge color={offerColor[status]}>Offer {humanize(status).toLowerCase()}</Badge>;
}

const interviewColor: Record<InterviewStatus, Color> = { SCHEDULED: "blue", DONE: "green", CANCELLED: "gray", NO_SHOW: "red" };
const interviewLabel: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  DONE: "Feedback in",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  return <Badge color={interviewColor[status]}>{interviewLabel[status]}</Badge>;
}

const recColor: Record<Recommendation, Color> = { STRONG_YES: "green", YES: "green", NO: "red", STRONG_NO: "red" };

export function RecommendationBadge({ value }: { value: Recommendation }) {
  return <Badge color={recColor[value]}>{humanize(value)}</Badge>;
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="text-amber-500" aria-label={`${value} out of 5`}>
      {"★".repeat(value)}
      <span className="text-slate-300">{"★".repeat(5 - value)}</span>
    </span>
  );
}
