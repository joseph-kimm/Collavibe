import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collavibe",
  description: "Shared evidence and context for teams building software with AI agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

