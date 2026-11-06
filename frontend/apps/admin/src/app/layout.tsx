import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Inter: the clean, neutral sans of the admin "lilac" look.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LMS Admin", template: "%s · LMS Admin" },
  description: "Manage courses, students, batches, live classes and the website.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
