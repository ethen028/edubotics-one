"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { CATEGORY_LABEL, EXPENSE_CATEGORIES, VEHICLES, VEHICLE_LABEL } from "@/lib/expenses";
import { submitClaim } from "./actions";

type Option = { id: string; name: string };

export function ClaimForm({
  today,
  rates,
  projects,
  organizations,
}: {
  today: string;
  rates: { TWO_WHEELER: number; CAR: number };
  projects: Option[];
  organizations: Option[];
}) {
  const [category, setCategory] = useState<string>("TRAVEL");
  const [vehicle, setVehicle] = useState<string>("");
  const [km, setKm] = useState("");
  const rate = vehicle ? rates[vehicle as keyof typeof rates] : 0;
  const byKm = category === "TRAVEL" && rate > 0;
  const computed = byKm ? Math.round((Number(km) || 0) * rate * 100) / 100 : null;

  return (
    <ActionForm action={submitClaim} className="grid gap-3 sm:grid-cols-2">
      <Field label="Date spent">
        <input type="date" name="date" required max={today} defaultValue={today} className="input" />
      </Field>
      <Field label="Category">
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="input">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      {category === "TRAVEL" && (
        <>
          <Field label="How did you travel?">
            <select name="vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="input">
              <option value="">Bus, train, auto or taxi (enter the fare)</option>
              {VEHICLES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>
          {vehicle && (
            <Field label="Distance (km, both ways)">
              <input
                name="distanceKm"
                type="number"
                min="0.1"
                step="0.1"
                required
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="input"
              />
            </Field>
          )}
        </>
      )}
      <Field label="Amount (₹)">
        {byKm ? (
          <>
            <input type="hidden" name="amount" value={computed ?? 0} />
            <div className="input bg-slate-50">
              ₹{(computed ?? 0).toLocaleString("en-IN")} <span className="text-xs text-slate-500">at ₹{rate}/km</span>
            </div>
          </>
        ) : (
          <input name="amount" type="number" min="1" step="0.01" required className="input" />
        )}
      </Field>
      <Field label="What was it for?" className="sm:col-span-2">
        <input
          name="description"
          required
          maxLength={300}
          placeholder="e.g. Office to Choice School and back, Grade 6 robotics class"
          className="input"
        />
      </Field>
      <Field label="Project (optional)">
        <select name="projectId" className="input" defaultValue="">
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="School or institution (optional)">
        <select name="organizationId" className="input" defaultValue="">
          <option value="">None</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Receipt (photo or PDF, up to 5 MB)" className="sm:col-span-2">
        <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" className="input" />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>Submit claim</SubmitButton>
      </div>
    </ActionForm>
  );
}
