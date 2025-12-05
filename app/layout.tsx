import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import GlobalPlayerEventListeners from "./components/GlobalPlayerEventListeners";

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
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased">
          <GlobalPlayerEventListeners />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
