import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Huginn",
  description: "Huginn - A shared Wurm Online mapping utility"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
