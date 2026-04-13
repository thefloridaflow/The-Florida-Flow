import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Florida Flow',
    short_name: 'FL Flow',
    description: 'Live South Florida ocean conditions — beach safety, rip current risk, NOAA buoys, dive windows.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait',
    categories: ['weather', 'sports', 'lifestyle'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Beach Conditions',
        short_name: 'Beach',
        description: 'Swim safety and flag estimates by region',
        url: '/beach',
        icons: [{ src: '/icon.svg', sizes: 'any' }],
      },
    ],
  }
}
