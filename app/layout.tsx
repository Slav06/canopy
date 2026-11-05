import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Canopy | Real Estate CRM",
  description: "A clear path from first conversation to closing.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
