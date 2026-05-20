import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BACKLOG MALDITO — Tu radar oscuro de videojuegos",
  description:
    "Extensión de Chrome para gestionar tu backlog de videojuegos. RAWG API, Side Panel, 9 tipos de contenido y mucho más.",
  keywords: [
    "backlog",
    "videojuegos",
    "Chrome extension",
    "RAWG",
    "gaming",
    "side panel",
  ],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "BACKLOG MALDITO",
    description: "Tu radar oscuro de videojuegos pendientes.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-arcade-black text-ghost-white`}
      >
        {/* Noise overlay for CRT feel */}
        <div className="noise-overlay" aria-hidden="true" />
        <div className="scanlines" aria-hidden="true" />

        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
