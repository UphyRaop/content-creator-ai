import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCAI · Creator Studio | Content Creator AI",
  applicationName: "Content Creator AI (CCAI) Creator Studio",
  icons: {
    icon: [
      { url: "/icons/v1/ccai-ai-monogram-dark-16.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icons/v1/ccai-ai-monogram-dark-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icons/v1/ccai-ai-monogram-dark-48.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icons/v1/ccai-ai-monogram-light-16.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icons/v1/ccai-ai-monogram-light-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icons/v1/ccai-ai-monogram-light-48.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: light)" },
    ],
    shortcut: "/icons/v1/favicon.ico",
    apple: [{ url: "/icons/v1/ccai-ai-monogram-dark-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest?v=1",
  description: "Content Creator AI (CCAI) Creator Studio — an approval-gated workspace for planning and producing videos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
