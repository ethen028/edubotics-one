import type { Employee } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field, Options } from "@/components/ui";
import { humanize, toDateInput } from "@/lib/format";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  employee?: Employee;
  departments: { id: string; name: string }[];
  managers: { id: string; firstName: string; lastName: string }[];
  withLogin?: boolean;
  suggestedCode?: string;
};

export function EmployeeForm({ action, employee: e, departments, managers, withLogin, suggestedCode }: Props) {
  return (
    <ActionForm action={action} className="space-y-6">
      <section className="card">
        <h2 className="mb-4 font-semibold">Job</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee code *">
            <input name="code" required defaultValue={e?.code ?? suggestedCode} className="input" />
          </Field>
          <Field label="First name *">
            <input name="firstName" required defaultValue={e?.firstName} className="input" />
          </Field>
          <Field label="Last name *">
            <input name="lastName" required defaultValue={e?.lastName} className="input" />
          </Field>
          <Field label="Work email *">
            <input name="workEmail" type="email" required defaultValue={e?.workEmail} className="input" />
          </Field>
          <Field label="Designation *">
            <input name="designation" required defaultValue={e?.designation} className="input" placeholder="Robotics Trainer" />
          </Field>
          <Field label="Department">
            <select name="departmentId" defaultValue={e?.departmentId ?? ""} className="input">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reports to">
            <select name="managerId" defaultValue={e?.managerId ?? ""} className="input">
              <option value="">—</option>
              {managers
                .filter((m) => m.id !== e?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Employment type">
            <select name="employmentType" defaultValue={e?.employmentType ?? "FULL_TIME"} className="input">
              <Options values={["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]} labels={humanize} />
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={e?.status ?? "ONBOARDING"} className="input">
              <Options values={["ONBOARDING", "ACTIVE", "ON_NOTICE", "EXITED"]} labels={humanize} />
            </select>
          </Field>
          <Field label="Date of joining *">
            <input name="dateOfJoining" type="date" required defaultValue={toDateInput(e?.dateOfJoining)} className="input" />
          </Field>
          <Field label="Date of exit">
            <input name="dateOfExit" type="date" defaultValue={toDateInput(e?.dateOfExit)} className="input" />
          </Field>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Personal</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone">
            <input name="phone" defaultValue={e?.phone ?? ""} className="input" placeholder="+91" />
          </Field>
          <Field label="Personal email">
            <input name="personalEmail" type="email" defaultValue={e?.personalEmail ?? ""} className="input" />
          </Field>
          <Field label="Date of birth">
            <input name="dateOfBirth" type="date" defaultValue={toDateInput(e?.dateOfBirth)} className="input" />
          </Field>
          <Field label="Gender">
            <select name="gender" defaultValue={e?.gender ?? ""} className="input">
              <option value="">—</option>
              <Options values={["Female", "Male", "Other", "Prefer not to say"]} />
            </select>
          </Field>
          <Field label="Blood group">
            <select name="bloodGroup" defaultValue={e?.bloodGroup ?? ""} className="input">
              <option value="">—</option>
              <Options values={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]} />
            </select>
          </Field>
          <Field label="City">
            <input name="city" defaultValue={e?.city ?? ""} className="input" placeholder="Kochi" />
          </Field>
          <Field label="State">
            <input name="state" defaultValue={e?.state ?? "Kerala"} className="input" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input name="address" defaultValue={e?.address ?? ""} className="input" />
          </Field>
          <Field label="Emergency contact name">
            <input name="emergencyName" defaultValue={e?.emergencyName ?? ""} className="input" />
          </Field>
          <Field label="Emergency contact phone">
            <input name="emergencyPhone" defaultValue={e?.emergencyPhone ?? ""} className="input" />
          </Field>
        </div>
      </section>

      {withLogin && (
        <section className="card">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="createLogin" defaultChecked /> Create a login for this person
          </label>
          <p className="mt-1 mb-4 text-sm text-slate-500">They sign in with their work email. Share the temporary password privately.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Role">
              <select name="role" defaultValue="EMPLOYEE" className="input">
                <Options values={["EMPLOYEE", "MANAGER", "ADMIN"]} labels={humanize} />
              </select>
            </Field>
            <Field label="Temporary password (8+ characters)">
              <input name="password" type="text" minLength={8} className="input" autoComplete="off" />
            </Field>
          </div>
        </section>
      )}

      <SubmitButton>{e ? "Save changes" : "Add employee"}</SubmitButton>
    </ActionForm>
  );
}
