import Image from 'next/image'

type FeaturedOperator = {
  name: string
  location: string
  tagline: string
  website: string
  logo: string
  phone?: string
  services: string[]
}

const FEATURED: FeaturedOperator[] = [
  {
    name: 'Space Coast Dive Center',
    location: 'Palm Bay, FL · Space Coast',
    tagline: 'Full-service dive center serving the Space Coast since 1988. SSI & PADI certifications, gear sales & service, local and international dive trips.',
    website: 'https://spacecoastdivecenter.com',
    logo: '/operators/space-coast-dive-center.png',
    phone: '(321) 723-8888',
    services: ['SSI & PADI Certifications', 'Gear Sales & Service', 'Tank Fills & Nitrox', 'Local & International Trips'],
  },
]

export default function FeaturedOperators() {
  if (FEATURED.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-white">Featured Operators</h2>
        <span className="text-xs bg-cyan-900/60 text-cyan-400 border border-cyan-700/50 px-2 py-1 rounded-full">Verified Partners</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURED.map(op => (
          <a
            key={op.name}
            href={op.website}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-cyan-700/50 transition-all rounded-2xl p-5 group"
          >
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                <Image
                  src={op.logo}
                  alt={op.name}
                  width={56}
                  height={56}
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-bold text-sm group-hover:text-cyan-400 transition-colors">{op.name}</p>
                  <span className="text-[10px] bg-cyan-900/50 text-cyan-400 border border-cyan-700/40 px-1.5 py-0.5 rounded-full font-semibold">✓ VERIFIED</span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">{op.location}</p>
                {op.phone && <p className="text-slate-500 text-xs">{op.phone}</p>}
              </div>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed mt-3">{op.tagline}</p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {op.services.map(s => (
                <span key={s} className="text-[10px] bg-slate-700/60 text-slate-400 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>

            <p className="text-cyan-600 group-hover:text-cyan-400 text-xs mt-3 transition-colors font-medium">Visit website →</p>
          </a>
        ))}
      </div>
    </section>
  )
}
