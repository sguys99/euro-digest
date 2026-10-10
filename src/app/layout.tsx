import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
