/* src/lib/employmentStatus.ts — small shared module for the
 * employment-status toggle (salaried / self-employed / both).
 *
 * Stored in its own localStorage key so /upload and /calculate (and
 * /take-home eventually) can read it without coupling. Doesn't change
 * tax math — the calculator already accepts a single gross earned-income
 * field. What it does change is the *framing*: when the user is
 * salaried under PAYE, "tax due" is mostly already paid via payroll; for
 * self-employed it's all owed via Self Assessment. The calculate page
 * shows different copy based on this. */

export type EmploymentStatus = "salaried" | "self-employed" | "both";

export const EMPLOYMENT_STORAGE_KEY = "uk-tax-advisor:employment";

export const DEFAULT_EMPLOYMENT_STATUS: EmploymentStatus = "salaried";

export const EMPLOYMENT_OPTIONS: Array<{
  value: EmploymentStatus;
  label: string;
  helpText: string;
}> = [
  {
    value: "salaried",
    label: "Salaried (PAYE)",
    helpText:
      "Your employer deducts income tax and NI from your salary every month. The 'tax due' figure below is what HMRC says you owe in total — most of it has already been paid via payroll.",
  },
  {
    value: "self-employed",
    label: "Self-employed",
    helpText:
      "Your bank receives the gross amount and you owe income tax + Class 4 NI on the profit via Self Assessment. The 'tax due' figure is your full liability — none of it has been collected yet.",
  },
  {
    value: "both",
    label: "Both",
    helpText:
      "Mix of PAYE salary and self-employment income. PAYE has collected some of the tax already; the rest comes out at Self Assessment. The figure below is the combined total tax owed; subtract what PAYE has paid from your P60 to get the balance.",
  },
];

export function loadEmploymentStatus(): EmploymentStatus {
  if (typeof window === "undefined") return DEFAULT_EMPLOYMENT_STATUS;
  try {
    const raw = window.localStorage.getItem(EMPLOYMENT_STORAGE_KEY);
    if (raw === "salaried" || raw === "self-employed" || raw === "both") {
      return raw;
    }
  } catch {
    // ignore
  }
  return DEFAULT_EMPLOYMENT_STATUS;
}

export function saveEmploymentStatus(value: EmploymentStatus): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMPLOYMENT_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function helpTextFor(status: EmploymentStatus): string {
  return (
    EMPLOYMENT_OPTIONS.find((o) => o.value === status)?.helpText ??
    EMPLOYMENT_OPTIONS[0].helpText
  );
}

export function labelFor(status: EmploymentStatus): string {
  return (
    EMPLOYMENT_OPTIONS.find((o) => o.value === status)?.label ?? "Salaried (PAYE)"
  );
}
