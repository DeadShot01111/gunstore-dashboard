import type { Metadata } from "next";
import "./globals.css";
import AppSessionProvider from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Gunstore 60",
  description: "Gunstore 60 dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}