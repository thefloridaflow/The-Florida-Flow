import { fetchAllBuoys, fetchTides, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'
import { getConditionsOverview } from '@/lib/overview'
import BuoyCard from '@/components/BuoyCard'
import ForecastPanel from '@/components/ForecastPanel'
import CommunitySection from '@/components/CommunitySection'
import RegionalConditionsTable from '@/components/RegionalConditionsTable'
import ActivityVerdicts from '@/components/ActivityVerdicts'
import BHBBanner from '@/components/BHBBanner'
import TidesAndDiveWindows from '@/components/TidesAndDiveWindows'
import OperatorLogs from '@/components/OperatorLogs'
import FeaturedOperators from '@/components/FeaturedOperators'
import EmailCapture from '@/components/EmailCapture'
import BHBGuideCard from '@/components/BHBGuideCard'
import NewsletterArchive from '@/components/NewsletterArchive'
import SunTimes from '@/components/SunTimes'
import UVIndex from '@/components/UVIndex'
import CurrentPanel from '@/components/CurrentPanel'

// Render dynamically at request time; each underlying fetch() call uses
// next: { revalidate: 3600 } so NOAA data is cached for 1 hour by Next.js.
export const dynamic = 'force-dynamic'

const BASE_URL = 'https://thefloridaflow.com'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'The Florida Flow',
  url: BASE_URL,
  description: 'Live ocean conditions, tides, and community dive reports for South Florida. Real-time NOAA buoy data, marine forecasts, and operator logs.',
  about: {
    '@type': 'Place',
    name: 'South Florida',
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 26.1,
      longitude: -80.1,
    },
  },
  potentialAction: {
    '@type': 'ReadAction',
    target: BASE_URL,
  },
}

export default async function HomePage() {
  const [buoys, tides, forecast, uv, current, overview] = await Promise.all([
    fetchAllBuoys(),
    fetchTides(),
    fetchMarineForecast(),
    fetchUVIndex(),
    fetchCurrents(),
    getConditionsOverview(),
  ])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌊</span>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">The Florida Flow</h1>
              <p className="text-xs text-slate-400">South Florida Ocean Conditions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-slate-400">Live · Updates hourly</span>
          </div>
        </div>
      </header>

      {/* Page index */}
      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <a href="#buoys" className="hover:text-slate-200 transition-colors">Buoys</a>
          <span className="text-slate-700">·</span>
          <a href="#regional" className="hover:text-slate-200 transition-colors">Regional</a>
          <span className="text-slate-700">·</span>
          <a href="#activity" className="hover:text-slate-200 transition-colors">By Activity</a>
          <span className="text-slate-700">·</span>
          <a href="#bhb" className="hover:text-slate-200 transition-colors">BHB Guide</a>
          <span className="text-slate-700">·</span>
          <a href="#uv-sun" className="hover:text-slate-200 transition-colors">UV &amp; Sun</a>
          <span className="text-slate-700">·</span>
          <a href="#tides" className="hover:text-slate-200 transition-colors">Tides &amp; Forecast</a>
          <span className="text-slate-700">·</span>
          <a href="#operators" className="hover:text-slate-200 transition-colors">Operators</a>
          <span className="text-slate-700">·</span>
          <a href="#newsletter" className="hover:text-slate-200 transition-colors">Newsletter</a>
          <span className="text-slate-700">·</span>
          <a href="#community" className="hover:text-slate-200 transition-colors">Community Reports</a>
        </div>
      </nav>

      {/* Hero — newsletter above the fold, dashboard flows below */}
      <section className="border-b border-slate-800 bg-slate-950/50">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center space-y-3">
          <h2 className="text-3xl font-bold text-white tracking-tight">South Florida, live.</h2>
          <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
            Daily ocean conditions, dive reports, and what&apos;s worth getting in the water for — delivered before 6 AM.
          </p>
          <div className="pt-1">
            <EmailCapture variant="hero" />
          </div>
          <p className="text-slate-600 text-xs">~100 divers and ocean lovers. No spam, ever.</p>
          <a href="#buoys" className="inline-block mt-4 text-slate-500 hover:text-slate-300 transition-colors text-xs">
            Live dashboard below ↓
          </a>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Conditions overview */}
        {overview && (
          <div className="bg-slate-800/60 rounded-xl px-5 py-4 border border-slate-700/50">
            <p className="text-sm text-slate-200 leading-relaxed">{overview}</p>
            <p className="text-xs text-slate-600 mt-2">AI summary from live NOAA buoy data · Refreshes when conditions shift</p>
          </div>
        )}

        {/* Buoy conditions */}
        <section id="buoys">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-2xl font-bold text-white">Buoy Conditions</h2>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">NOAA NDBC</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {buoys.map(b => (
              <BuoyCard key={b.stationId} buoy={b} />
            ))}
            <BHBGuideCard />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> &lt; 2 ft — Calm</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> 2–4 ft — Choppy</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> 4–6 ft — Rough</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> &gt; 6 ft — Dangerous</span>
          </div>
        </section>

        {/* Regional Conditions */}
        <div id="regional"><RegionalConditionsTable buoys={buoys} precip24hMm={uv.precip24hMm ?? 0} /></div>

        {/* By Activity */}
        <div id="activity"><ActivityVerdicts buoys={buoys} /></div>

        {/* BHB Site Guide */}
        <div id="bhb"><BHBBanner /></div>

        {/* UV · Sun Times */}
        <section id="uv-sun" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UVIndex uv={uv} />
          <SunTimes />
        </section>

        {/* Tides · Forecast · Currents (tides include BHB dive windows) */}
        <section id="tides" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2">
            <TidesAndDiveWindows tides={tides} />
          </div>
          <ForecastPanel forecast={forecast} />
          <CurrentPanel current={current} />
        </section>

        {/* Featured (paid) operators */}
        <div id="operators" className="space-y-10">
          <FeaturedOperators />
          <OperatorLogs />
        </div>

        {/* Newsletter — signup + previous issues */}
        <section id="newsletter" className="space-y-6">
          <EmailCapture />
          <NewsletterArchive />
        </section>

        {/* Community Reports */}
        <div id="community"><CommunitySection /></div>
      </main>

      <footer className="border-t border-slate-800 mt-16 py-8 text-center text-xs text-slate-600 space-y-2">
        <p>
          <span className="text-slate-500 font-medium">Data sources: </span>
          <a href="https://www.ndbc.noaa.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NOAA NDBC</a> ·{' '}
          <a href="https://tidesandcurrents.noaa.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NOAA Tides &amp; Currents</a> ·{' '}
          <a href="https://www.weather.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NWS Marine Forecasts</a> ·{' '}
          <a href="https://open-meteo.com" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">Open-Meteo</a> ·{' '}
          <a href="https://idiveflorida.com/BlueHeronBridgeTideTableChart.php" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">iDiveFlorida</a>
        </p>
        <p>
          For informational purposes only. Always confirm conditions with your captain or dive operator before heading out.
          Use at your own risk. Community reports are user-submitted and unverified.
        </p>
      </footer>
    </div>
  )
}
