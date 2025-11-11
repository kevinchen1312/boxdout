import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2026 NBA Draft Prospects Calendar",
  description: "Track college basketball games featuring top 2026 NBA draft prospects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
