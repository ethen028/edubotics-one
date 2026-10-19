import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of use", robots: { index: true, follow: true } };

export default function TermsPage() {
  return <LegalPage title="Terms of use">
    <p>Orbit is an operations workspace for authorized Edubotics users, with a public careers section for job applicants.</p>
    <h2 className="text-lg font-semibold">Using the service</h2>
    <p>Use your own authorized account, keep credentials confidential and report suspected unauthorized access to your administrator. Only access, download or change information you are permitted to handle. Do not upload malicious files, interfere with the service or submit information you have no right to share.</p>
    <h2 className="text-lg font-semibold">Job applications</h2>
    <p>Provide accurate information and documents relevant to the vacancy. Applying does not guarantee an interview or employment. Job availability and recruitment decisions may change; any offer and employment terms are communicated separately by Edubotics.</p>
    <h2 className="text-lg font-semibold">Work records and availability</h2>
    <p>Check important records and report mistakes promptly. Payroll, billing and other operational outputs require review by authorized staff. Access may be interrupted for maintenance or technical issues and may be restricted when an account no longer requires access.</p>
    <h2 className="text-lg font-semibold">Questions</h2>
    <p>Contact your administrator about workspace access or these terms. Applicants can use the recruitment contact shown on the careers page when available. These terms do not replace employment agreements, company policies or rights that apply under law.</p>
  </LegalPage>;
}
