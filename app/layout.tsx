import type { Metadata } from "next";
import { Source_Serif_4, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

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
  icons: { apple: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif4.variable} ${interTight.variable} ${jetbrainsMono.variable} antialiased`}
      data-theme="ocean"
      data-accent="tide"
      data-motion="full"
    >
      <body>
        {children}
        <ServiceWorkerRegistration />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
