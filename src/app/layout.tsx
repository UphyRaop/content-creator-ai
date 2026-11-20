import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCAI · Creator Studio | Content Creator AI",
  applicationName: "Content Creator AI (CCAI) Creator Studio",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%23090909%27/%3E%3Cpath d=%27M43 16a20 20 0 1 0 0 32%27 fill=%27none%27 stroke=%27%23FF8A24%27 stroke-width=%276%27 stroke-linecap=%27round%27/%3E%3Cpath d=%27M25 32h22M37 21v22%27 fill=%27none%27 stroke=%27%23800024%27 stroke-width=%275%27 stroke-linecap=%27round%27/%3E%3C/svg%3E" },
  description: "Content Creator AI (CCAI) Creator Studio — an approval-gated workspace for planning and producing videos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
