import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";
import { ChatProvider } from "./contexts/ChatContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Conjure",
  description: "AI-powered image editor that runs entirely in your browser. No uploads, no servers — just ImageMagick WebAssembly and generative UI.",
  icons: {
    icon: [
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon.ico" },
    ],
    apple: "/favicon/apple-touch-icon.png",
    other: [
      { rel: "manifest", url: "/favicon/site.webmanifest" },
    ],
  },
  openGraph: {
    title: "Conjure — AI Image Editor",
    description: "AI-powered image editor that runs entirely in your browser. No uploads, no servers — just ImageMagick WebAssembly and generative UI.",
    url: "https://conjure.vercel.app",
    siteName: "Conjure",
    images: [
      {
        url: "/conjure-logo.png",
        width: 1200,
        height: 630,
        alt: "Conjure AI Image Editor",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conjure — AI Image Editor",
    description: "AI-powered image editor that runs entirely in your browser.",
    images: ["/conjure-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} antialiased`}
      >
        <ChatProvider>{children}</ChatProvider>
      </body>
    </html>
  );
}
