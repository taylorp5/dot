'use client'

import { useEffect, useRef } from 'react'

interface Dot {
  x: number
  y: number
  colorHex?: string
  color_hex?: string
}

interface CanvasProps {
  dots: Dot[]
}

export default function Canvas({ dots }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const setupAndDraw = () => {
      const rect = container.getBoundingClientRect()
      const cssW = rect.width
      const cssH = rect.height
      const dpr = window.devicePixelRatio || 1

      // Set canvas size accounting for DPR
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      
      // Set CSS size to match container
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`

      // Get context and scale for DPR
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Scale context to handle DPR
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Clear canvas before redraw
      ctx.clearRect(0, 0, cssW, cssH)

      // Draw all dots using normalized coordinates
      dots.forEach((dot) => {
        // Convert normalized [0,1] coordinates to pixel positions
        const px = dot.x * cssW
        const py = dot.y * cssH

        // Handle both colorHex (camelCase) and color_hex (snake_case) for compatibility
        const color = (dot as any).colorHex ?? (dot as any).color_hex ?? '#000000'

        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      })
    }

    setupAndDraw()
    window.addEventListener('resize', setupAndDraw)
    return () => window.removeEventListener('resize', setupAndDraw)
  }, [dots])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: 'crosshair',
          touchAction: 'none'
        }}
      />
    </div>
  )
}


