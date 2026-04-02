import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = 'https://www.thefloridaflow.com'

export const metadata: Metadata = {
  title: {
    default: 'The Florida Flow — South Florida Ocean Conditions',
    template: '%s — The Florida Flow',
  },
  description: 'Live ocean conditions for South Florida — Space Coast to the Keys. Real-time NOAA buoy data, tides, marine forecasts, dive reports, and operator logs. Free daily newsletter.',
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: '/' },
  keywords: [
    'South Florida ocean conditions', 'Florida diving conditions', 'NOAA buoy data Florida',
    'Blue Heron Bridge diving', 'Florida Keys conditions', 'Space Coast surf report',
    'Florida marine forecast', 'South Florida tides', 'Florida scuba diving conditions',
    'Fort Lauderdale ocean conditions', 'Palm Beach diving', 'Florida fishing conditions',
  ],
  openGraph: {
    title: 'The Florida Flow — South Florida Ocean Conditions',
    description: 'Live NOAA buoy data, tides, dive reports, and marine forecasts for South Florida — Space Coast to the Keys.',
    url: BASE_URL,
    siteName: 'The Florida Flow',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'The Florida Flow — South Florida Ocean Conditions' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Florida Flow — South Florida Ocean Conditions',
    description: 'Live NOAA buoy data, tides, dive reports, and marine forecasts — Space Coast to the Keys.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className={`${inter.className} bg-slate-900 min-h-screen`}>{children}<Analytics /><SpeedInsights /></body>
    </html>
  );
}
