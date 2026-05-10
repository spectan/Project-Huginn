import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Huginn",
  description: "Huginn - A shared Wurm Online mapping utility",
  icons: {
    icon: [
      {
        sizes: "16x16",
        type: "image/x-icon",
        url: "/favicon.ico"
      },
      {
        sizes: "16x16",
        type: "image/png",
        url: "/logos/huginn-16-dark.png"
      }
    ]
  }
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
