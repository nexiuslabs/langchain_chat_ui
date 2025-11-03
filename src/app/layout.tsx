import type { Metadata } from "next";
import "./globals.css";
import { Lato } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import AppProviders from "@/components/providers/app-providers";

const lato = Lato({ subsets: ["latin"], preload: true, display: "swap", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Agent Chat",
  description: "Modern, branded agent chat UI",
  openGraph: {
    title: "Agent Chat",
    description: "Modern, branded agent chat UI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={lato.className}>
        <NuqsAdapter>
          <AppProviders>{children}</AppProviders>
        </NuqsAdapter>
      </body>
    </html>
  );
}
