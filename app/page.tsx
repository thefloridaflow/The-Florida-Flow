import { Suspense } from 'react'
import { fetchAllBuoys, fetchTides, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'
import { getConditionsOverview } from '@/lib/overview'
import ActivityVerdicts from '@/components/ActivityVerdicts'
import BHBBanner from '@/components/BHBBanner'
import TidesAndDiveWindows from '@/components/TidesAndDiveWindows'
import OperatorLogs from '@/components/OperatorLogs'
import FeaturedOperators from '@/components/FeaturedOperators'
import RegionalConditionsTable from '@/components/RegionalConditionsTable'
import OceanBackground from '@/components/OceanBackground'
import LiveClock from '@/components/LiveClock'
import ScrollReveal from '@/components/ScrollReveal'
import ForecastPanel from '@/components/ForecastPanel'
import CurrentPanel from '@/components/CurrentPanel'
import SunTimes from '@/components/SunTimes'
import UVIndex from '@/components/UVIndex'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://thefloridaflow.com'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'The Florida Flow',
  url: BASE_URL,
  description: 'Live ocean conditions, tides, and community dive reports for South Florida.',
  about: { '@type': 'Place', name: 'South Florida' },
  potentialAction: { '@type': 'ReadAction', target: BASE_URL },
}

// SVG icon defs — referenced with <use href="#i-...">
function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-wave" viewBox="0 0 24 24">
          <path d="M2 12 Q6 8 10 12 T18 12 T22 12 M2 17 Q6 13 10 17 T18 17 T22 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="wave-line" />
        </symbol>
        <symbol id="i-mask" viewBox="0 0 24 24">
          <path d="M4 8 L20 8 L19 15 C19 17 17 18 15 17 L13 15 L11 15 L9 17 C7 18 5 17 5 15 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1="4" y1="8" x2="2" y2="6" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="i-surf" viewBox="0 0 24 24">
          <path d="M4 17 C8 15 10 12 12 7 C14 12 16 15 20 17 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-fish" viewBox="0 0 24 24">
          <path d="M3 12 C6 7 12 7 16 12 C12 17 6 17 3 12 Z M16 12 L21 8 L21 16 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="7" cy="11" r="0.8" fill="currentColor" />
        </symbol>
        <symbol id="i-paddle" viewBox="0 0 24 24">
          <ellipse cx="12" cy="17" rx="9" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 3 L15 3 L12 6 Z" fill="currentColor" />
        </symbol>
        <symbol id="i-anchor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="7" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
          <line x1="8" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 15 C4 19 8 20 12 20 C16 20 20 19 20 15" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="i-umbrella" viewBox="0 0 24 24">
          <path d="M3 12 C3 7 7 4 12 4 C17 4 21 7 21 12 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="12" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 20 C12 21 13 22 14 22" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </symbol>
        <symbol id="i-thermo" viewBox="0 0 24 24">
          <path d="M12 4 A2 2 0 0 1 14 6 V13 A4 4 0 1 1 10 13 V6 A2 2 0 0 1 12 4 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="17" r="1.5" fill="currentColor" />
        </symbol>
        <symbol id="i-wind" viewBox="0 0 24 24">
          <path d="M3 9 H14 A2 2 0 1 0 12 7 M3 13 H17 A2 2 0 1 1 15 15 M3 17 H10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
            <line x1="4.5" y1="4.5" x2="6.5" y2="6.5" />
            <line x1="17.5" y1="17.5" x2="19.5" y2="19.5" />
            <line x1="4.5" y1="19.5" x2="6.5" y2="17.5" />
            <line x1="17.5" y1="6.5" x2="19.5" y2="4.5" />
          </g>
        </symbol>
        <symbol id="i-stream" viewBox="0 0 24 24">
          <path d="M3 6 C8 6 12 18 17 18 C20 18 21 16 21 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M17 10 L21 14 L17 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
      </defs>
    </svg>
  )
}

// ── Server async components ───────────────────────────────────

async function HeroStatusPanel() {
  const buoys = await fetchAllBuoys()
  const bhb = buoys.find(b => b.stationId === 'LKWF1')
  const offshore = buoys.find(b => b.stationId === '41122') ?? buoys.find(b => b.stationId === '41009')

  const wind = bhb?.windSpeed ?? offshore?.windSpeed ?? '—'
  const windDir = bhb?.windDir ?? offshore?.windDir ?? ''
  const waterTemp = bhb?.waterTemp ?? offshore?.waterTemp ?? '—'
  const seas = offshore?.waveHeight ?? '—'
  const period = offshore?.wavePeriod ?? null

  return (
    <div className="hero-status">
      <div className="hero-status-head">
        <div className="hero-status-title">Today&apos;s snapshot · South FL</div>
        <div className="hero-status-time"><LiveClock /></div>
      </div>
      <h3 className="hero-verdict">
        Real-time conditions. <em>Updated hourly from NOAA.</em>
      </h3>
      <div className="hero-stat-grid">
        <div className="hero-stat">
          <div className="l">Seas</div>
          <div className="v">{seas}<small>{period ? ` ft · ${period}s` : ' ft'}</small></div>
        </div>
        <div className="hero-stat">
          <div className="l">Wind</div>
          <div className="v">{wind}<small>{`kt ${windDir}`}</small></div>
        </div>
        <div className="hero-stat">
          <div className="l">Water</div>
          <div className="v">{waterTemp}<small>°F · LKWF1</small></div>
        </div>
      </div>
    </div>
  )
}

async function ConditionsStrip() {
  const [buoys, uv] = await Promise.all([fetchAllBuoys(), fetchUVIndex()])
  const offshore = buoys.find(b => b.stationId === '41122') ?? buoys.find(b => b.stationId === '41009')
  const inshore = buoys.find(b => b.stationId === 'LKWF1')
  const bhbWind = inshore?.windSpeed ?? offshore?.windSpeed ?? '—'
  const bhbWindDir = inshore?.windDir ?? offshore?.windDir ?? ''
  const seas = offshore?.waveHeight ?? '—'
  const period = offshore?.wavePeriod ?? '—'
  const waterTemp = inshore?.waterTemp ?? offshore?.waterTemp ?? '—'
  const uvIdx = uv.uvIndex?.toString() ?? '—'
  const airTemp = '—'

  return (
    <div className="cond-row reveal">
      <div className="cond-cell">
        <div className="l">
          <svg className="ico"><use href="#i-wave" /></svg>
          Seas avg
        </div>
        <div className="v">{seas}<span className="u">ft</span></div>
        <div className="meta">{period !== '—' ? `${period}s period` : 'offshore'}</div>
      </div>
      <div className="cond-cell">
        <div className="l">
          <svg className="ico"><use href="#i-wind" /></svg>
          Wind
        </div>
        <div className="v">{bhbWind}<span className="u">kt {bhbWindDir}</span></div>
        <div className="meta">BHB inshore sensor</div>
      </div>
      <div className="cond-cell">
        <div className="l">
          <svg className="ico"><use href="#i-thermo" /></svg>
          Water temp
        </div>
        <div className="v">{waterTemp}<span className="u">°F</span></div>
        <div className="meta">Lake Worth · LKWF1</div>
      </div>
      <div className="cond-cell">
        <div className="l">
          <svg className="ico"><use href="#i-sun" /></svg>
          UV / Air
        </div>
        <div className="v">{uvIdx}<span className="u">/ {airTemp}</span></div>
        <div className="meta">Open-Meteo forecast</div>
      </div>
    </div>
  )
}

async function BuoyGrid() {
  const buoys = await fetchAllBuoys()

  function statusClass(waveHeight: string | null) {
    if (!waveHeight) return 'warn'
    const h = parseFloat(waveHeight)
    if (h < 2) return 'good'
    if (h < 4) return 'warn'
    return 'bad'
  }

  return (
    <div className="buoy-grid reveal">
      {buoys.map(b => (
        <div key={b.stationId} className="buoy">
          <div className="buoy-head">
            <div>
              <div className="buoy-id">{b.stationId} · {b.offshoreNm > 0 ? `${b.offshoreNm} nm` : 'inshore'}</div>
              <div className="buoy-name">{b.name}</div>
            </div>
            <div className={`buoy-status ${statusClass(b.waveHeight)}`} />
          </div>
          {b.error ? (
            <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--t3)', margin: '0' }}>Data unavailable</p>
          ) : (
            <div className="buoy-stats">
              <div className="bs">
                <div className="l">Seas</div>
                <div className="v">{b.waveHeight ?? '—'}<small>{b.wavePeriod ? ` ft · ${b.wavePeriod}s` : ' ft'}</small></div>
              </div>
              <div className="bs">
                <div className="l">Wind</div>
                <div className="v">{b.windSpeed ?? '—'}<small>{b.windDir ? ` kt ${b.windDir}` : ' kt'}</small></div>
              </div>
              <div className="bs">
                <div className="l">Water</div>
                <div className="v">{b.waterTemp ?? '—'}<small>°F</small></div>
              </div>
              <div className="bs">
                <div className="l">Updated</div>
                <div className="v" style={{ fontSize: '13px' }}>
                  {new Date(b.updated).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit',
                    hour12: true, timeZone: 'America/New_York',
                  })}
                  <small> ET</small>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

async function ActivitySection() {
  const buoys = await fetchAllBuoys()
  return <ActivityVerdicts buoys={buoys} />
}

async function TidesSection() {
  const [tides, forecast, current] = await Promise.all([fetchTides(), fetchMarineForecast(), fetchCurrents()])
  return (
    <div className="reveal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--rule)', border: '1px solid var(--rule)' }}>
      <div style={{ background: 'var(--abyss)' }}>
        <TidesAndDiveWindows tides={tides} />
      </div>
      <div style={{ background: 'var(--abyss)', display: 'grid', gridTemplateColumns: '1fr', gap: '1px' }}>
        <ForecastPanel forecast={forecast} />
        <CurrentPanel current={current} />
      </div>
    </div>
  )
}

async function RegionalSection() {
  const [buoys, uv] = await Promise.all([fetchAllBuoys(), fetchUVIndex()])
  return <RegionalConditionsTable buoys={buoys} precip24hMm={uv.precip24hMm ?? 0} />
}

async function OverviewBanner() {
  const overview = await getConditionsOverview()
  if (!overview) return null
  return (
    <div className="reveal" style={{
      background: 'rgba(6,26,46,0.5)',
      border: '1px solid var(--rule)',
      borderLeft: '2px solid var(--accent)',
      padding: '20px 24px',
    }}>
      <p style={{ fontFamily: 'var(--serif)', fontSize: '15px', lineHeight: '1.6', color: 'var(--t2)', margin: '0 0 8px' }}>{overview}</p>
      <p style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--t4)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
        AI summary · live NOAA data · refreshes when conditions shift
      </p>
    </div>
  )
}

async function SunUVSection() {
  const uv = await fetchUVIndex()
  return (
    <div className="reveal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--rule)', border: '1px solid var(--rule)' }}>
      <div style={{ background: 'var(--abyss)', padding: '0' }}><UVIndex uv={uv} /></div>
      <div style={{ background: 'var(--abyss)', padding: '0' }}><SunTimes /></div>
    </div>
  )
}

// ── Skeletons ─────────────────────────────────────────────────

function Skeleton({ h }: { h: number }) {
  return (
    <div style={{
      height: h, background: 'rgba(10,37,64,0.4)',
      border: '1px solid var(--rule)', animation: 'pulse 2s ease-in-out infinite',
    }} />
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <IconDefs />
      <OceanBackground />
      <ScrollReveal />

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="logo">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#i-wave" />
              </svg>
            </div>
            <div>
              <div className="name"><b>The</b>FloridaFlow</div>
              <div className="sub">South FL · Live Ocean Data</div>
            </div>
          </div>

          <nav className="topnav" aria-label="Main navigation">
            <a href="#now">Now</a>
            <a href="#buoys">Buoys</a>
            <a href="#activity">Activity</a>
            <a href="#tides">Tides</a>
            <a href="#bhb">BHB</a>
            <a href="#newsletter">Newsletter</a>
          </nav>

          <div className="live-pill">
            <span className="dot" aria-hidden="true" />
            <LiveClock />
            {' '}· LIVE
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero" aria-label="Hero">
        <div className="hero-photo" aria-hidden="true" />
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-content">
          <div>
            <div className="hero-kicker">South Florida · Live ocean data</div>
            <h1 className="hero-h1">The water, <b>live</b>.</h1>
            <p className="hero-lede">
              Real-time ocean conditions for divers, anglers, and watermen —
              <em> buoys, tides, and operator logs from the Space Coast to Key West</em>,
              every morning before sunrise.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="#now">
                See conditions <span className="arr">→</span>
              </a>
              <a className="btn btn-ghost" href="#newsletter">
                Get the daily briefing
              </a>
            </div>
          </div>

          <Suspense fallback={<div className="hero-status" style={{ minHeight: 200 }} />}>
            <HeroStatusPanel />
          </Suspense>
        </div>

        <div className="scroll-cue" aria-hidden="true">
          <span>Scroll to see the day</span>
          <div className="line" />
        </div>
      </section>

      <main>
        {/* 01 — Conditions strip */}
        <section className="sec" id="now" style={{ paddingTop: 60 }}>
          <div className="wrap">
            <div className="sec-head reveal">
              <div className="sec-mark"><span className="num">01</span> Right now</div>
              <h2 className="sec-title">At a glance. <b>Live from the water.</b></h2>
              <p className="sec-sub">Buoy obs from across South Florida. Refreshes hourly from NOAA NDBC.</p>
            </div>
            <Suspense fallback={<Skeleton h={160} />}>
              <ConditionsStrip />
            </Suspense>
          </div>
        </section>

        {/* AI overview */}
        <section className="sec" style={{ paddingTop: 0, paddingBottom: 40 }}>
          <div className="wrap">
            <Suspense fallback={null}>
              <OverviewBanner />
            </Suspense>
          </div>
        </section>

        {/* 02 — Buoys */}
        <section className="sec" id="buoys" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="sec-head reveal" style={{ marginBottom: 32 }}>
              <div className="sec-mark"><span className="num">02</span> Buoys</div>
              <h2 className="sec-title">Six stations. <b>Live signal.</b></h2>
            </div>
            <Suspense fallback={<Skeleton h={320} />}>
              <BuoyGrid />
            </Suspense>
          </div>
        </section>

        {/* 03 — Activity verdicts */}
        <section className="sec" id="activity">
          <div className="wrap">
            <div className="sec-head reveal">
              <div className="sec-mark"><span className="num">03</span> By activity</div>
              <h2 className="sec-title">Should I go? <b>Five honest answers.</b></h2>
              <p className="sec-sub">Based on live buoy data. Always confirm with your captain or operator.</p>
            </div>
            <div className="reveal">
              <Suspense fallback={<Skeleton h={400} />}>
                <ActivitySection />
              </Suspense>
            </div>
          </div>
        </section>

        {/* 04 — Tides & dive windows */}
        <section className="sec" id="tides">
          <div className="wrap">
            <div className="sec-head reveal">
              <div className="sec-mark"><span className="num">04</span> Tides &amp; dive windows</div>
              <h2 className="sec-title"><b>Blue Heron Bridge</b> — slack tide is everything.</h2>
              <p className="sec-sub">Tide predictions and optimal BHB dive windows for the next 48 hours.</p>
            </div>
            <Suspense fallback={<Skeleton h={400} />}>
              <TidesSection />
            </Suspense>
          </div>
        </section>

        {/* 05 — Regional conditions */}
        <section className="sec" id="regional">
          <div className="wrap">
            <div className="sec-head reveal">
              <div className="sec-mark"><span className="num">05</span> By region</div>
              <h2 className="sec-title">Space Coast to Key West. <b>Full picture.</b></h2>
            </div>
            <div className="reveal">
              <Suspense fallback={<Skeleton h={300} />}>
                <RegionalSection />
              </Suspense>
            </div>
          </div>
        </section>

        {/* 06 — UV & Sun */}
        <section className="sec" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Suspense fallback={null}>
              <SunUVSection />
            </Suspense>
          </div>
        </section>

        {/* BHB feature */}
        <section className="sec" id="bhb">
          <div className="wrap">
            <div className="reveal">
              <BHBFeatureCard />
            </div>
          </div>
        </section>

        {/* 07 — Operator logs */}
        <section className="sec" id="operators">
          <div className="wrap">
            <div className="sec-head reveal">
              <div className="sec-mark"><span className="num">06</span> Yesterday underwater</div>
              <h2 className="sec-title">Operator logs from <b>real divers</b>.</h2>
              <p className="sec-sub">Submitted by South Florida shops the morning after. Not algorithms.</p>
            </div>
            <div className="reveal">
              <FeaturedOperators />
              <div style={{ marginTop: 24 }}>
                <OperatorLogs />
              </div>
            </div>
          </div>
        </section>

        {/* 08 — Newsletter CTA */}
        <section className="sec" id="newsletter">
          <div className="wrap">
            <div className="cta-section reveal">
              <div>
                <div className="sec-mark" style={{ marginBottom: 16 }}>The morning briefing</div>
                <h3 className="cta-h">
                  Be the first to know <b>before the tide turns.</b>
                </h3>
                <p className="cta-p">
                  Every morning at 6 AM EST: buoys, tides, dive windows, operator logs, and the day&apos;s call.
                  No fluff. <em>Free, forever.</em>
                </p>
              </div>
              <div>
                <NewsletterForm />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <div className="name"><b>The</b> Florida Flow</div>
              <p>Live ocean conditions, dive reports, and what&apos;s worth getting in the water for. Space Coast to Key West, every morning.</p>
            </div>
            <div className="foot-col">
              <h5>Conditions</h5>
              <ul>
                <li><a href="#buoys">Buoys</a></li>
                <li><a href="#tides">Tides &amp; BHB</a></li>
                <li><a href="#activity">By Activity</a></li>
                <li><a href="#regional">By Region</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h5>Sources</h5>
              <ul>
                <li><a href="https://www.ndbc.noaa.gov" target="_blank" rel="noopener">NOAA NDBC</a></li>
                <li><a href="https://tidesandcurrents.noaa.gov" target="_blank" rel="noopener">NOAA Tides</a></li>
                <li><a href="https://www.weather.gov" target="_blank" rel="noopener">NWS Marine</a></li>
                <li><a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 The Florida Flow · Built in Palm Beach</span>
            <span>For information only · Always confirm with your captain</span>
          </div>
        </div>
      </footer>
    </>
  )
}

// ── Inline sub-components ──────────────────────────────────────

function BHBFeatureCard() {
  return (
    <div className="bhb">
      <div>
        <div className="bhb-mark">Featured · Site guide</div>
        <h3>First time at <b>Blue Heron Bridge?</b></h3>
        <p>
          The original 56-page field guide to South Florida&apos;s most legendary shore dive —
          tide windows, entry points, what to expect on the bottom, and how to make the most
          of every dive. Printable cards, offline tide tables, real talk from divers who&apos;ve
          logged 500+ dives here.
        </p>
        <div style={{ marginTop: 28 }}>
          <BHBBanner />
        </div>
      </div>
      <div className="bhb-card">
        <div className="price">$12<small>One-time · Lifetime updates</small></div>
        <ul>
          <li>56-page printable PDF</li>
          <li>Tide windows for 12 months</li>
          <li>Offline tide tables &amp; entry maps</li>
          <li>Operator picks &amp; safety briefing</li>
        </ul>
        <a href="https://buy.stripe.com/bIY7uA4mb3LJ6kg4gh" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
          Get the guide <span className="arr">→</span>
        </a>
      </div>
    </div>
  )
}

function NewsletterForm() {
  return (
    <div className="cta-form">
      <form
        className="cta-row"
        action="/api/subscribe"
        method="POST"
      >
        <input type="email" name="email" placeholder="you@email.com" required />
        <button type="submit">Subscribe →</button>
      </form>
      <div className="cta-meta">
        <span><b>168</b> divers reading</span>
        <span><b>Free</b> forever</span>
        <span><b>One</b> click unsubscribe</span>
      </div>
    </div>
  )
}
