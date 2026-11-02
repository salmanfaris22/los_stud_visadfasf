import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display-family" });

export const metadata: Metadata = {
  title: { default: "LMS Admin", template: "%s · LMS Admin" },
  description: "Manage courses, students, batches, live classes and the website.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
