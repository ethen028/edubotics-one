import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy", robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return <LegalPage title="Privacy notice">
    <p>Edubotics One supports Edubotics Global’s internal operations and public job applications. This notice describes the information handled by this application.</p>
    <h2 className="text-lg font-semibold">Information and purpose</h2>
    <p>When you apply for a job, we collect the contact details, application answers and resume you submit to assess your application and contact you about recruitment. Please avoid including sensitive information that is unnecessary for your application.</p>
    <p>For authorized staff, the workspace holds account details and work records such as attendance, leave, payroll, expenses, projects and business contacts. These support employment administration and daily business operations. Access depends on your account permissions.</p>
    <h2 className="text-lg font-semibold">Storage, sharing and retention</h2>
    <p>Information is stored in the application database and configured file storage. Authorized staff and service providers operating hosting, backups or email may process information needed to deliver those services. We do not add advertising trackers or sell application data through this app.</p>
    <p>Records and backups are retained according to the organization’s operational and legal needs. Ask the administrator for the retention period that applies to your record. Removing an active record may not immediately remove copies from backups.</p>
    <h2 className="text-lg font-semibold">Cookies and service logs</h2>
    <p>When configured, Cloudflare Turnstile checks public forms for automated submissions. Your browser connects to Cloudflare to perform that check; the application verifies the result on the server. Google sign-in, when enabled by the organization, also connects to Google. These services have their own privacy terms.</p>
    <p>The app uses essential authentication cookies for signed-in sessions. Local service metrics count broad route and response groups without visitor identifiers; counters expire within 24 hours and reset when the process restarts. Error references omit raw messages and personal information. Hosting infrastructure may separately record technical information such as request time, IP address and errors for security and reliability. This release includes no third-party advertising or visitor analytics service.</p>
    <h2 className="text-lg font-semibold">Questions and requests</h2>
    <p>Contact your Edubotics administrator to ask about access, correction, deletion or use of your information. Job applicants can use the recruitment contact displayed on the careers page when configured, or the Edubotics contact through which they learned about the vacancy. Requests are reviewed according to applicable requirements and recordkeeping obligations.</p>
  </LegalPage>;
}
