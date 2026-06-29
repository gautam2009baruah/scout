import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
