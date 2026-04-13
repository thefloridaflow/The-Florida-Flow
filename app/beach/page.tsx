import { Suspense } from 'react'
import { fetchAllBuoys, fetchUVIndex } from '@/lib/noaa'
import RegionalBeachCard, { BeachRegion } from '@/components/RegionalBeachCard'
import EmailCapture from '@/components/EmailCapture'
import UVIndex from '@/components/UVIndex'
import SunTimes from '@/components/SunTimes'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'South Florida Beach Conditions Today | The Florida Flow',
  description: 'Is it safe to swim today? Real-time rip current risk, flag color estimates, water temp, and sea state for South Florida beaches — Space Coast to the Keys.',
  openGraph: {
    title: 'South Florida Beach Conditions Today',
    description: 'Rip current risk, flag estimates, water temp, and surf for every region — Space Coast to the Keys. Updated hourly from NOAA buoys.',
    url: 'https://thefloridaflow.com/beach',
  },
}

const REGIONS: BeachRegion[] = [
  {
    name: 'Space Coast',
    beaches: ['Cocoa Beach', 'Satellite Beach', 'Melbourne Beach', 'Sebastian Inlet'],
    waveBuoyId: '41009',
  },
  {
    name: 'Treasure Coast',
    beaches: ['Fort Pierce Beach', 'Vero Beach', 'Jensen Beach', 'Hutchinson Island'],
    waveBuoyId: '41114',
  },
  {
    name: 'Gold Coast',
    beaches: ['Palm Beach', 'Boca Raton', 'Deerfield Beach', 'Fort Lauderdale', 'Hollywood', 'Miami Beach'],
    waveBuoyId: '41122',
    windBuoyId: 'LKWF1',
  },
  {
    name: 'Florida Keys',
    beaches: ['Islamorada', 'Marathon', 'Bahia Honda', 'Key West'],
    waveBuoyId: 'SMKF1',
  },
]

const FLAG_GUIDE = [
  { color: 'bg-emerald-500', label: 'Green', desc: 'Low hazard. Calm conditions. Safe to swim.' },
  { color: 'bg-yellow-400',  label: 'Yellow', desc: 'Medium hazard. Moderate surf or currents. Swim with caution.' },
  { color: 'bg-red-500',     label: 'Red', desc: 'High hazard. Rough surf or strong currents. Experienced swimmers only.' },
  { color: 'bg-red-800',     label: 'Double Red', desc: 'Water closed to the public. Do not enter.' },
  { color: 'bg-purple-600',  label: 'Purple', desc: 'Dangerous marine life (jellyfish, stingrays). May fly alongside other flags.' },
]

async function BeachConditions() {
  const [buoys, uv] = await Promise.all([fetchAllBuoys(), fetchUVIndex()])

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REGIONS.map(region => (
          <RegionalBeachCard key={region.name} region={region} buoys={buoys} />
        ))}
      </div>
      <p className="text-xs text-slate-600 mt-3">
        Flag estimates based on NOAA buoy data. Nearshore conditions vary from offshore readings — always check posted flags and swim near a lifeguard.
      </p>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
        <UVIndex uv={uv} />
        <SunTimes />
      </section>
    </>
  )
}

function CardSkeleton() {
  return <div className="bg-slate-800 rounded-2xl h-48 animate-pulse" />
}

function BeachSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  )
}

export default function BeachPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <span className="text-3xl">🌊</span>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">The Florida Flow</h1>
                <p className="text-xs text-slate-400">Beach Conditions</p>
              </div>
            </a>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">Full dashboard →</a>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs text-slate-400">Live · NOAA</span>
            </div>
          </div>
        </div>
      </header>

      <section className="bg-slate-950/60 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center space-y-3">
          <h2 className="text-3xl font-bold text-white tracking-tight">Is it safe to swim today?</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
            Rip current risk, flag estimates, water temp, and surf conditions — Space Coast to the Keys. Updated hourly.
          </p>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        <Suspense fallback={<BeachSkeleton />}>
          <BeachConditions />
        </Suspense>

        {/* What the flags mean */}
        <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
          <h2 className="text-lg font-bold text-white mb-4">What do the beach flags mean?</h2>
          <div className="space-y-3">
            {FLAG_GUIDE.map(({ color, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <span className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 ${color}`} />
                <div>
                  <span className="text-sm font-medium text-slate-200">{label}</span>
                  <span className="text-slate-400 text-sm"> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-4">
            Flag colors are set by local beach patrol — not NOAA. The estimates above are based on offshore buoy readings and may not match posted flags exactly. Always obey posted flags.
          </p>
        </section>

        {/* Rip current safety */}
        <section className="bg-red-950/40 rounded-2xl p-6 border border-red-900/40">
          <h2 className="text-lg font-bold text-white mb-3">Caught in a rip current?</h2>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside leading-relaxed">
            <li><span className="text-white font-medium">Stay calm.</span> Rip currents are narrow — they won&apos;t pull you under, just out.</li>
            <li><span className="text-white font-medium">Don&apos;t fight it.</span> Swimming directly back to shore exhausts you quickly.</li>
            <li><span className="text-white font-medium">Swim parallel to shore</span> until you&apos;re out of the current, then angle back in.</li>
            <li><span className="text-white font-medium">Float and signal</span> for help if you&apos;re tired. Lifeguards can reach you.</li>
          </ol>
          <p className="text-xs text-slate-600 mt-4">
            Rip currents cause ~100 deaths per year in the US. Most are preventable. Swim near lifeguard stands.
          </p>
        </section>

        {/* Newsletter signup */}
        <section className="text-center space-y-3 py-4">
          <h2 className="text-xl font-bold text-white">Get daily beach conditions</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Free newsletter every morning — rip current risk, water temp, and what to expect before you head out.
          </p>
          <div className="max-w-sm mx-auto pt-1">
            <EmailCapture variant="hero" />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 mt-8 py-8 text-center text-xs text-slate-600 space-y-2">
        <p>
          <a href="https://www.ndbc.noaa.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NOAA NDBC</a>{' · '}
          <a href="https://www.weather.gov" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">NWS Marine Forecasts</a>{' · '}
          <a href="https://open-meteo.com" className="text-slate-500 hover:text-slate-300 transition-colors" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
        </p>
        <p>
          Offshore buoy readings (20–60 nm) are not the same as nearshore conditions. Flag estimates are unofficial.
          Always check posted flags and swim near a lifeguard. Use at your own risk.
        </p>
        <p>
          <a href="/" className="text-slate-500 hover:text-slate-300 transition-colors">← Full conditions dashboard</a>
        </p>
      </footer>
    </div>
  )
}
