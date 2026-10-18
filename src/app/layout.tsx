import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { publicOrigin } from "@/lib/public-site";
import { CookieNotice } from "@/components/cookie-notice";
import { NotificationProvider } from "@/components/notifications";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../lib/pdf/fonts/Inter-Regular.otf", weight: "400", style: "normal" },
    { path: "../lib/pdf/fonts/Inter-SemiBold.otf", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin() ?? "http://localhost:3000"),
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  openGraph: { title: "Edubotics Global", description: "People, projects and learning programmes.", images: ["/opengraph-image"] },
  title: { default: "Edubotics One", template: "%s · Edubotics One" },
  description: "Internal operations for Edubotics Global: CRM, HR, payroll, projects and timesheets",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await headers(); // Nonce-bearing pages must render per request, never from a shared static cache.
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <NotificationProvider>{children}<CookieNotice /></NotificationProvider>
      </body>
    </html>
  );
}
