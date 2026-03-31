import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = 'https://the-florida-flow.vercel.app'

export const metadata: Metadata = {
  title: "The Florida Flow",
  description: "Live ocean conditions, tides, and community dive reports for South Florida. Real-time NOAA buoy data, tides, marine forecasts, and operator logs.",
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'The Florida Flow',
    description: 'Live ocean conditions, tides, and community dive reports for South Florida.',
    url: BASE_URL,
    siteName: 'The Florida Flow',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'The Florida Flow',
    description: 'Live ocean conditions, tides, and community dive reports for South Florida.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className={`${inter.className} bg-slate-900 min-h-screen`}>{children}<Analytics /></body>
    </html>
  );
}
