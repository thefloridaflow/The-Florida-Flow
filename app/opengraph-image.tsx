import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px 96px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            width: '72px',
            height: '6px',
            background: '#38bdf8',
            borderRadius: '3px',
            marginBottom: '40px',
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: '80px',
            fontWeight: 'bold',
            color: '#ffffff',
            letterSpacing: '-1px',
            lineHeight: 1,
            marginBottom: '24px',
          }}
        >
          The Florida Flow
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '32px',
            color: '#94a3b8',
            marginBottom: '60px',
          }}
        >
          Live ocean conditions · Space Coast to Key Largo
        </div>

        {/* Data pills row */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {['NOAA Buoys', 'Tides', 'Marine Forecast', 'Dive Windows', 'UV'].map(
            (label) => (
              <div
                key={label}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  padding: '10px 20px',
                  borderRadius: '6px',
                }}
              >
                {label}
              </div>
            )
          )}
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '56px',
            right: '96px',
            fontSize: '22px',
            color: '#475569',
          }}
        >
          thefloridaflow.com
        </div>
      </div>
    ),
    { ...size }
  )
}
