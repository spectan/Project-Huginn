import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wurm Map Utility",
  description: "Shared Wurm Online map annotation utility"
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
