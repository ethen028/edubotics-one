import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { getCurrentUser } from "@/lib/auth";
import { publicOrigin } from "@/lib/public-site";
import { NotificationProvider } from "@/components/notifications";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin() ?? "http://localhost:3000"),
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  openGraph: { title: "Edubotics Global", description: "People, projects and learning programmes.", images: ["/opengraph-image"] },
  title: { default: "Edubotics One", template: "%s · Edubotics One" },
  description: "Internal operations for Edubotics Global: CRM, HR, payroll, projects and timesheets",
};

// Keeps data-device on <html> in step with the computer's or phone's light/dark setting, so "Match my device"
// can follow it (also when it changes later). React never renders data-device, so it is left alone.
const WATCH_DEVICE = `(function(){var m=matchMedia("(prefers-color-scheme: dark)"),h=document.documentElement;function a(){h.dataset.device=m.matches?"dark":"light"}a();m.addEventListener("change",a)})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await getCurrentUser())?.theme ?? "LIGHT";
  return (
    <html lang="en" data-theme={theme} className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <NotificationProvider>{children}</NotificationProvider>
        <Script id="watch-device" strategy="beforeInteractive">
          {WATCH_DEVICE}
        </Script>
      </body>
    </html>
  );
}
