import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCAI · Video Studio",
  description: "An approval-gated workspace for planning and producing videos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
