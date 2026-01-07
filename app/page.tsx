'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './page.module.css'
import { STRIPE_PRICES } from '@/lib/stripe-prices'

interface Session {
  sessionId: string
  colorName: string
  colorHex: string
  blindDotsUsed: number
  revealed: boolean
  credits: number
}

interface Dot {
  x: number
  y: number
  color_hex: string
  phase: 'blind' | 'paid'
  created_at: string
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [colorNameInput, setColorNameInput] = useState('')
  const [dots, setDots] = useState<Dot[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('dotSession')
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession)
        setSession(parsed)
        setIsRevealed(parsed.revealed)
        
        // If revealed, fetch all dots
        if (parsed.revealed) {
          fetchAllDots(parsed.sessionId)
        }
      } catch (e) {
        console.error('Error loading session:', e)
      }
    }
  }, [])

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const canceled = params.get('canceled')

    if (success === '1' && session) {
      // Refetch session to get updated credits
      fetchSessionSnapshot(session.sessionId)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (canceled === '1') {
      // User canceled - could show a message if needed
      console.log('Payment canceled')
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [session])

  const initSession = async () => {
    if (!colorNameInput.trim()) {
      alert('Please enter a color name')
      return
    }

    try {
      const response = await fetch('/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorName: colorNameInput.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to initialize session')
        return
      }

      const newSession: Session = {
        sessionId: data.sessionId,
        colorName: data.colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      setSession(newSession)
      localStorage.setItem('dotSession', JSON.stringify(newSession))
      setColorNameInput('')
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
    }
  }

  const placeDot = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!session || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    try {
      const response = await fetch('/api/dots/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          x,
          y
        })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to place dot')
        return
      }

      // Update session
      const updatedSession: Session = {
        sessionId: data.sessionId,
        colorName: data.colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      setSession(updatedSession)
      setIsRevealed(updatedSession.revealed)
      localStorage.setItem('dotSession', JSON.stringify(updatedSession))

      // If not revealed, only show our own blind dots
      if (!updatedSession.revealed) {
        // Add dot locally (only our own)
        setDots(prev => [...prev, {
          x,
          y,
          color_hex: updatedSession.colorHex,
          phase: 'blind',
          created_at: new Date().toISOString()
        }])
      } else {
        // If just became revealed, fetch all dots
        fetchAllDots(updatedSession.sessionId)
      }
    } catch (error) {
      console.error('Error placing dot:', error)
      alert('Failed to place dot')
    }
  }

  const revealSession = async () => {
    if (!session) return

    try {
      const response = await fetch('/api/session/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to reveal session')
        return
      }

      const updatedSession: Session = {
        sessionId: data.sessionId,
        colorName: data.colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      setSession(updatedSession)
      setIsRevealed(true)
      localStorage.setItem('dotSession', JSON.stringify(updatedSession))

      // Fetch all dots after revealing
      fetchAllDots(updatedSession.sessionId)
    } catch (error) {
      console.error('Error revealing session:', error)
      alert('Failed to reveal session')
    }
  }

  const fetchAllDots = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/dots/all?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Error fetching dots:', data.error)
        return
      }

      setDots(data)
    } catch (error) {
      console.error('Error fetching all dots:', error)
    }
  }

  const fetchSessionSnapshot = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/session?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Error fetching session:', data.error)
        return
      }

      const updatedSession: Session = {
        sessionId: data.sessionId,
        colorName: data.colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      setSession(updatedSession)
      localStorage.setItem('dotSession', JSON.stringify(updatedSession))
    } catch (error) {
      console.error('Error fetching session snapshot:', error)
    }
  }

  const purchaseCredits = async (priceId: string) => {
    if (!session || isLoadingPurchase) return

    setIsLoadingPurchase(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          priceId: priceId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to create checkout session')
        setIsLoadingPurchase(false)
        return
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      alert('Failed to create checkout session')
      setIsLoadingPurchase(false)
    }
  }

  // Credit bundle configurations
  const creditBundles = [
    { priceId: STRIPE_PRICES.CREDITS_25, credits: 25, price: 0.25, label: '25 Credits - $0.25' },
    { priceId: STRIPE_PRICES.CREDITS_100, credits: 100, price: 1.00, label: '100 Credits - $1.00' },
    { priceId: STRIPE_PRICES.CREDITS_500, credits: 500, price: 5.00, label: '500 Credits - $5.00' },
  ]

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1>Dot Canvas</h1>
        {session && (
          <div className={styles.sessionInfo}>
            <span>{session.colorName} — {session.colorHex}</span>
            <div className={styles.stats}>
              <span>Blind: {session.blindDotsUsed}/10</span>
              {isRevealed && <span>Credits: {session.credits}</span>}
            </div>
          </div>
        )}
      </div>

      {!session ? (
        <div className={styles.initForm}>
          <h2>Choose Your Color</h2>
          <input
            type="text"
            value={colorNameInput}
            onChange={(e) => setColorNameInput(e.target.value)}
            placeholder="Enter color name (e.g., Blue, Red, Green)"
            className={styles.colorInput}
            onKeyPress={(e) => e.key === 'Enter' && initSession()}
          />
          <button onClick={initSession} className={styles.initButton}>
            Start Session
          </button>
        </div>
      ) : (
        <>
          <div
            ref={canvasRef}
            className={styles.canvas}
            onClick={placeDot}
          >
            {dots.map((dot, idx) => (
              <div
                key={idx}
                className={styles.dot}
                style={{
                  left: `${dot.x}%`,
                  top: `${dot.y}%`,
                  backgroundColor: dot.color_hex
                }}
              />
            ))}
          </div>

          <div className={styles.controls}>
            {!isRevealed && session.blindDotsUsed >= 10 && (
              <button onClick={revealSession} className={styles.revealButton}>
                Reveal Canvas
              </button>
            )}
            {isRevealed && (
              <div className={styles.revealedSection}>
                <p className={styles.revealedText}>
                  Canvas revealed! You can see all dots. Credits required for new dots.
                </p>
                <div className={styles.creditPurchase}>
                  <h3>Buy Credits</h3>
                  <div className={styles.creditButtons}>
                    {creditBundles.map((bundle) => (
                      <button
                        key={bundle.priceId}
                        onClick={() => purchaseCredits(bundle.priceId)}
                        disabled={isLoadingPurchase}
                        className={styles.creditButton}
                      >
                        {bundle.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}

