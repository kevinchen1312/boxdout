import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import GlobalPlayerEventListeners from "./components/GlobalPlayerEventListeners";

export const metadata: Metadata = {
  title: "2026 NBA Draft Prospects Calendar",
  description: "Track college basketball games featuring top 2026 NBA draft prospects",
};

// Check if Clerk is configured (for build-time safety)
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // If Clerk is not configured, render without auth provider
  if (!clerkPubKey) {
    return (
      <html lang="en">
        <body className="antialiased">
          <GlobalPlayerEventListeners />
          {children}
        </body>
      </html>
    );
  }

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
