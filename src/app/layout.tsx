import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Edubotics One", template: "%s · Edubotics One" },
  description: "Internal operations for Edubotics Global: CRM, HR, payroll, projects and timesheets",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Sample looks to choose from; the cookie is only for previewing them.
  const look = (await cookies()).get("look")?.value ?? "fresh";
  return (
    <html
      lang="en"
      data-look={look}
      className={`${manrope.variable} ${bricolage.variable} ${jakarta.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
