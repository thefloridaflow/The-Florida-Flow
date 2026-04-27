'use client'

import { useEffect, useId } from 'react'

export default function OceanBackground() {
  const id = useId()

  useEffect(() => {
    const el = document.getElementById('bubbles-' + id)
    if (!el) return
    el.innerHTML = ''
    const n = 18
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div')
      b.className = 'bubble'
      const size = 4 + Math.random() * 14
      b.style.width = size + 'px'
      b.style.height = size + 'px'
      b.style.left = Math.random() * 100 + '%'
      b.style.animationDuration = (10 + Math.random() * 14) + 's'
      b.style.animationDelay = (-Math.random() * 14) + 's'
      el.appendChild(b)
    }
  }, [id])

  return (
    <>
      <div className="ocean-bg" aria-hidden="true" />
      <div className="caustics" aria-hidden="true" />
      <div className="bubbles" id={'bubbles-' + id} aria-hidden="true" />
    </>
  )
}
