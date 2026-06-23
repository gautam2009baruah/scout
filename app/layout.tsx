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
        <Script id="scout-adoption-player-config" strategy="beforeInteractive">
          {`
            window.ScoutAdoptionPlayerConfig = {
              scoutBaseUrl: "http://localhost:3001",
              targetAppId: "9de764bc-205e-4476-b061-12d101b092da"
            };
          `}
        </Script>
        <Script src="http://localhost:3001/scout-adoption-player.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
