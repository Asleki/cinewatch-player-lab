import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CineWatch Player Lab",
  description: "Isolated qualification environment for the CineWatch TV Player",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
