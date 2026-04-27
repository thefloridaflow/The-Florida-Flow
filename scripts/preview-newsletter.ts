import { buildNewsletterHtml, type NewsletterJson, type TemplateCtx } from '../lib/newsletter-template'
import { writeFileSync } from 'fs'

const json: NewsletterJson = {
  alert: {
    type: 'calm',
    title: 'Calm week ahead for most of the coast',
    titleItalic: 'a good stretch',
    subtitle: 'Light winds, moderate seas. Best diving window in weeks at BHB.',
  },
  verdict: {
    todaysCall: 'Light SW winds, 2-3 ft seas coast-wide. Good morning window before the sea breeze fills in.',
    status: 'good',
    statusLabel: 'GOOD',
    bestWindow: '7–10 AM',
    bestWindowSub: 'before sea breeze',
    seasNow: '2.1 ft',
    seasSub: '41009 · 20nm offshore',
    water: '79°F',
    waterSub: 'LKWF1 · BHB inshore',
  },
  lede: {
    headline: 'A calm Monday opens the week',
    headlineItalic: 'coast-wide',
    paragraphs: [
      'SW winds at 8-12 kt are keeping the Atlantic side flat this morning. Seas are running 2-2.5 ft at the offshore buoys, with a long 9-second period that is barely noticeable at the surface.',
      'The BHB tide window is excellent today. Slack high at 8:46 AM, visibility running 15-20 ft. This is one of the cleaner windows of the month.',
    ],
  },
  regions: [
    { state: 'good', stateLabel: 'Good', vis: '20-50 ft', visObs: false },
    { state: 'good', stateLabel: 'Good', vis: '20-40 ft', visObs: false },
    { state: 'good', stateLabel: 'Good', vis: '15-25 ft', visObs: true },
    { state: 'good', stateLabel: 'Good', vis: '20-40 ft', visObs: false },
    { state: 'choppy', stateLabel: 'Choppy', vis: '15-30 ft', visObs: false },
    { state: 'nodata', stateLabel: 'No data', vis: '—', visObs: false },
    { state: 'good', stateLabel: 'Good', vis: '20-40 ft', visObs: false },
    { state: 'good', stateLabel: 'Good', vis: '30-60 ft', visObs: false },
  ],
  activities: [
    { name: 'Scuba', verdict: 'good', verdictLabel: 'Good', notes: 'BHB window peaks at 8:46 AM. Offshore reefs are clean. Confirm with your operator.' },
    { name: 'Surfing', verdict: 'caution', verdictLabel: 'Caution', notes: '2 ft at 9s — too long a period for surfable breaks. Mushy at best.' },
    { name: 'Kayak / SUP', verdict: 'good', verdictLabel: 'Good', notes: 'Calm inshore waters until the sea breeze kicks in around 11 AM.' },
    { name: 'Boating / Fishing', verdict: 'good', verdictLabel: 'Good', notes: 'Good offshore day. 2-3 ft with SW winds — comfortable ride out.' },
    { name: 'Beach', verdict: 'good', verdictLabel: 'Good', notes: 'Low rip risk, SW winds. Green flags likely most of the coast.' },
    { name: 'Gulf Stream', verdict: 'good', verdictLabel: 'Good', notes: 'Seas well below 4 ft. Stream crossings are a go.' },
  ],
  beach: {
    paragraphs: [
      'Water is 79°F — comfortable and warm. Seas are running about 2 feet with a long, slow swell. Surface is gentle.',
      'UV index is 9 today, which is Very High. Apply SPF 50+ before you leave the car and reapply every 90 minutes.',
    ],
    ripRisk: 'low',
    flagColor: 'green',
    bestTimeNote: 'Morning hours before 10 AM are calmest before the sea breeze develops.',
  },
  bhbNote: 'Today\'s BHB window is one of the better ones this month. Slack high at 8:46 AM, visibility estimated 15-20 ft with SW winds at 6 kt. Wind under the 12 kt threshold — conditions are a go.',
  sightings: [
    { operator: 'Force-E Scuba', location: 'Riviera Beach', quote: 'Visibility was running 20 ft at the Northern Palm Beaches yesterday. Spotted a big school of spadefish on the ledge.', vis: '20 ft', water: '79°F' },
    { operator: 'Dixie Divers', location: 'Pompano Beach', quote: 'Reef was clean. Couple of nurse sharks on the bottom. Nice dive.', vis: '25 ft', water: '78°F' },
  ],
  weekOutlook: [
    { verdict: 'good', verdictLabel: 'GOOD', note: 'Calm, SW winds 8-12 kt' },
    { verdict: 'good', verdictLabel: 'GOOD', note: 'Slight increase, 2-3 ft' },
    { verdict: 'choppy', verdictLabel: 'CHOPPY', note: 'E wind building, 3-4 ft' },
    { verdict: 'choppy', verdictLabel: 'CHOPPY', note: 'Onshore 15-20 kt' },
    { verdict: 'good', verdictLabel: 'GOOD', note: 'Front passes, settling' },
  ],
  safety: {
    title: 'UV Index 9 — Very High today',
    body: 'Even with partly cloudy skies, UV 9 will burn unprotected skin in under 20 minutes. Apply SPF 50+ before you leave the car, not at the beach. Reapply every 90 minutes in the water.',
  },
  poll: {
    question: 'What\'s your primary reason for checking conditions?',
    options: ['Planning a dive', 'Fishing trip', 'Beach day / swimming', 'Boating or paddleboarding'],
  },
  meta: {
    subject: '2.1 ft · 79°F · BHB window 8:46 AM — calm Monday',
    title: 'The Florida Flow — Issue #42 · April 27, 2026',
    desc: 'Light SW winds, 2-3 ft seas, BHB window at 8:46 AM. Free South Florida ocean conditions newsletter.',
    excerpt: 'Calm coast-wide this morning with a clean BHB window at 8:46 AM. SW winds staying light through noon.',
  },
}

const now = new Date('2026-04-27T09:00:00-04:00')
const sunrise = new Date('2026-04-27T06:42:00-04:00')
const sunset  = new Date('2026-04-27T19:53:00-04:00')

const ctx: TemplateCtx = {
  issueNumber: 42,
  etLong: 'Monday, April 27, 2026',
  etShort: 'April 27, 2026',
  now,
  byId: {
    '41009': { stationId: '41009', waveHeight: '2.1', wavePeriod: '9', waterTemp: '77', windSpeed: '8', windDir: 'SW', offshoreNm: 20 },
    '41114': { stationId: '41114', waveHeight: '1.8', wavePeriod: '8', waterTemp: '78', windSpeed: '6', windDir: 'SW', offshoreNm: 7 },
    'LKWF1': { stationId: 'LKWF1', waveHeight: '0.5', waterTemp: '79', windSpeed: '6', windDir: 'WNW' },
    '41122': { stationId: '41122', waveHeight: '2.6', wavePeriod: '8', waterTemp: '78', windSpeed: '12', windDir: 'SSW', offshoreNm: 23 },
    'SMKF1': { stationId: 'SMKF1', waveHeight: '1.9', wavePeriod: '9', waterTemp: '81', windSpeed: '7', windDir: 'SW', offshoreNm: 1 },
    '42095': { stationId: '42095', waveHeight: '1.4', wavePeriod: '10', waterTemp: '82', windSpeed: '5', windDir: 'SSW', offshoreNm: 15 },
  },
  bhbDays: [
    {
      label: 'Today (Mon Apr 27)',
      tides: [
        { time: '8:46 AM', height: '2.8', quality: 'Optimal', windowStart: '7:46 AM', windowEnd: '9:46 AM' },
        { time: '3:02 PM', height: '2.4', quality: 'Fair', windowStart: '2:02 PM', windowEnd: '4:02 PM' },
      ],
    },
  ],
  uv: { uvIndex: 9, uvIndexTomorrow: 8 },
  current: { speed: '1.2', direction: 'N', error: false },
  sunrise,
  sunset,
  goldenMorningEnd: new Date(sunrise.getTime() + 45 * 60000),
  goldenEveningStart: new Date(sunset.getTime() - 45 * 60000),
}

const html = buildNewsletterHtml(json, ctx)
writeFileSync('newsletter-preview.html', html)
console.log(`Written newsletter-preview.html (${(html.length / 1024).toFixed(1)} KB)`)
