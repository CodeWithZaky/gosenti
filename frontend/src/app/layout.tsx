"use client";

import { ServerStatusBanner } from "@/components/ServerStatus";
import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body
        className={`${inter.className} flex h-screen overflow-hidden antialiased bg-background`}
      >
        <Toaster position="bottom-right" richColors closeButton />
        {/* Sidebar - padding 8px */}
        <Sidebar />
        <ServerStatusBanner />

        {/* Main Content - padding 8px */}
        <main className="flex-1 m-2 overflow-y-auto">
          <Card className="shadow-none px-6 py-4 border min-h-[calc(100vh-1rem)]">
            {children}
          </Card>
        </main>
      </body>
    </html>
  );
}
