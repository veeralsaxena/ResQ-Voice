import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResQ-Voice — Field triage copilot",
  description: "Hands-busy emergency voice copilot. Interrupt and keep the dose current.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-night font-sans text-[#e8eee9] antialiased">{children}</body>
    </html>
  );
}
