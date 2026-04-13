import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = 'https://thefloridaflow.com'

export const metadata: Metadata = {
  title: {
    default: 'The Florida Flow',
    template: '%s — The Florida Flow',
  },
  description: 'Live ocean conditions for South Florida. Real-time NOAA buoy data for divers, surfers, boaters, and fishermen from the Space Coast to Key Largo.',
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: '/' },
  keywords: [
    'South Florida ocean conditions', 'Florida diving conditions', 'NOAA buoy data Florida',
    'Blue Heron Bridge diving', 'Florida Keys conditions', 'Space Coast surf report',
    'Florida marine forecast', 'South Florida tides', 'Florida scuba diving conditions',
    'Fort Lauderdale ocean conditions', 'Palm Beach diving', 'Florida fishing conditions',
  ],
  openGraph: {
    title: 'The Florida Flow',
    description: 'Live ocean conditions for South Florida. Real-time NOAA buoy data for divers, surfers, boaters, and fishermen from the Space Coast to Key Largo.',
    url: BASE_URL,
    siteName: 'The Florida Flow',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Florida Flow',
    description: 'Live ocean conditions for South Florida. Real-time NOAA buoy data for divers, surfers, boaters, and fishermen from the Space Coast to Key Largo.',
  },
  robots: { index: true, follow: true },
  icons: {
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className={`${inter.className} bg-slate-900 min-h-screen`}>
        {children}
        <ServiceWorkerRegistration />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
