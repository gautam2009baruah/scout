import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scout Chatbot",
  description: "A polished embeddable chatbot frontend built with Next.js, TypeScript, and Tailwind CSS."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Orchestration Player - enables in-context workflow execution */}
        <Script 
          src="/scout-orchestration-player.js" 
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
