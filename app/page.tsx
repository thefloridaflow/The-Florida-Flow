import { fetchAllBuoys, fetchTides, fetchMarineForecast } from '@/lib/noaa'
import BuoyCard from '@/components/BuoyCard'
import TidePanel from '@/components/TidePanel'
import ForecastPanel from '@/components/ForecastPanel'
import CommunitySection from '@/components/CommunitySection'

// Render dynamically at request time; each underlying fetch() call uses
// next: { revalidate: 3600 } so NOAA data is cached for 1 hour by Next.js.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [buoys, tides, forecast] = await Promise.all([
    fetchAllBuoys(),
    fetchTides(),
    fetchMarineForecast(),
  ])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
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

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Buoy conditions */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-2xl font-bold text-white">Buoy Conditions</h2>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">NOAA NDBC</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {buoys.map(b => (
              <BuoyCard key={b.stationId} buoy={b} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> &lt; 2 ft — Calm</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> 2–4 ft — Choppy</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> 4–6 ft — Rough</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> &gt; 6 ft — Dangerous</span>
          </div>
        </section>

        {/* Tides + Forecast */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TidePanel tides={tides} />
          <ForecastPanel forecast={forecast} />
        </section>

        {/* Community Reports */}
        <CommunitySection />
      </main>

      <footer className="border-t border-slate-800 mt-16 py-6 text-center text-xs text-slate-600">
        <p>
          Data sourced from{' '}
          <a href="https://www.ndbc.noaa.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NOAA NDBC</a>,{' '}
          <a href="https://tidesandcurrents.noaa.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NOAA Tides</a>, and{' '}
          <a href="https://www.weather.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NWS</a>.
          Community reports are user-submitted and unverified.
        </p>
      </footer>
    </div>
  )
}
