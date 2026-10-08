import type { Candidate, JobOpening } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field, Options } from "@/components/ui";
import { humanize } from "@/lib/format";
import { CANDIDATE_SOURCES } from "@/lib/recruitment";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

export function JobForm({
  action,
  job,
  departments,
  users,
}: {
  action: Action;
  job?: JobOpening;
  departments: Option[];
  users: Option[];
}) {
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title *">
          <input name="title" required defaultValue={job?.title} className="input" placeholder="Robotics Trainer" />
        </Field>
        <Field label="Department">
          <select name="departmentId" defaultValue={job?.departmentId ?? ""} className="input">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employment type">
          <select name="employmentType" defaultValue={job?.employmentType ?? "FULL_TIME"} className="input">
            <Options values={["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]} labels={humanize} />
          </select>
        </Field>
        <Field label="Location">
          <input name="location" defaultValue={job?.location ?? "Kochi"} className="input" />
        </Field>
        <Field label="Positions to fill *">
          <input name="positions" type="number" min={1} max={50} required defaultValue={job?.positions ?? 1} className="input" />
        </Field>
        <Field label="Salary range (team only)">
          <input name="salaryRange" defaultValue={job?.salaryRange ?? ""} className="input" placeholder="₹18,000 – 25,000 a month" />
        </Field>
        <Field label="Hiring manager">
          <select name="hiringManagerId" defaultValue={job?.hiringManagerId ?? ""} className="input">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="What the role involves and who you're looking for">
        <textarea
          name="description"
          rows={5}
          defaultValue={job?.description ?? ""}
          className="input"
          placeholder="Teach robotics and coding to grades 1–8 at partner schools. B.Tech/B.Sc with Arduino basics; Malayalam and English."
        />
      </Field>
      <SubmitButton>{job ? "Save job" : "Open job"}</SubmitButton>
    </ActionForm>
  );
}

export function CandidateForm({
  action,
  candidate,
  jobs,
  jobId,
  withResume,
}: {
  action: Action;
  candidate?: Candidate;
  jobs: { id: string; title: string }[];
  jobId?: string;
  withResume?: boolean;
}) {
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Applying for *">
          <select name="jobId" required defaultValue={candidate?.jobId ?? jobId ?? ""} className="input">
            <option value="">Choose a job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full name *">
          <input name="name" required defaultValue={candidate?.name} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={candidate?.phone ?? ""} className="input" placeholder="+91" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={candidate?.email ?? ""} className="input" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={candidate?.city ?? ""} className="input" placeholder="Kochi" />
        </Field>
        <Field label="Source">
          <select name="source" defaultValue={candidate?.source ?? "Referral"} className="input">
            <Options values={CANDIDATE_SOURCES} />
          </select>
        </Field>
        <Field label="Referred by">
          <input name="referredBy" defaultValue={candidate?.referredBy ?? ""} className="input" placeholder="If a referral" />
        </Field>
        <Field label="Current role or course">
          <input
            name="currentRole"
            defaultValue={candidate?.currentRole ?? ""}
            className="input"
            placeholder="B.Tech ECE, final year"
          />
        </Field>
        <Field label="Experience (years)">
          <input
            name="experienceYears"
            type="number"
            step="0.5"
            min={0}
            defaultValue={candidate?.experienceYears?.toString() ?? ""}
            className="input"
          />
        </Field>
        <Field label="Expected salary (₹ a month)">
          <input
            name="expectedSalary"
            type="number"
            min={0}
            step="500"
            defaultValue={candidate?.expectedSalary?.toString() ?? ""}
            className="input"
          />
        </Field>
        <Field label="Notice period">
          <input name="noticePeriod" defaultValue={candidate?.noticePeriod ?? ""} className="input" placeholder="Immediate, 30 days…" />
        </Field>
        {withResume && (
          <Field label="Resume (PDF or photo, up to 5 MB)">
            <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="input" />
          </Field>
        )}
      </div>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={candidate?.notes ?? ""} className="input" />
      </Field>
      <SubmitButton>{candidate ? "Save" : "Add candidate"}</SubmitButton>
    </ActionForm>
  );
}
