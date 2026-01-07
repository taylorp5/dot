'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './page.module.css'
import { STRIPE_PRICES } from '@/lib/stripe-prices'
import { COLOR_SWATCHES } from '@/lib/color-swatches'

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
  const [dots, setDots] = useState<Dot[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const [isSelectingColor, setIsSelectingColor] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('dotSession')
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession)
        setSession(parsed)
        setIsRevealed(parsed.revealed)
        
        // If revealed, always fetch all dots
        if (parsed.revealed) {
          fetchAllDots(parsed.sessionId)
        }
        // If not revealed, canvas stays blank (only user's dots from localStorage if any)
      } catch (e) {
        console.error('Error loading session:', e)
      }
    } else {
      setIsSelectingColor(true)
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

  const initSession = async (colorName: string) => {
    setIsSelectingColor(false)
    
    try {
      const response = await fetch('/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorName })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to initialize session')
        setIsSelectingColor(true)
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
      setIsRevealed(newSession.revealed)
      localStorage.setItem('dotSession', JSON.stringify(newSession))
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
      setIsSelectingColor(true)
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

      // Handle auto-reveal: when blind dots reach 0 (10 used), automatically fetch all dots
      if (!session.revealed && updatedSession.revealed) {
        // Just became revealed - fetch all dots immediately
        fetchAllDots(updatedSession.sessionId)
      } else if (!updatedSession.revealed) {
        // Still in blind phase - only show our own dots
        setDots(prev => [...prev, {
          x,
          y,
          color_hex: updatedSession.colorHex,
          phase: 'blind',
          created_at: new Date().toISOString()
        }])
      }
    } catch (error) {
      console.error('Error placing dot:', error)
      alert('Failed to place dot')
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
      setIsRevealed(updatedSession.revealed)
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
        console.error('Checkout error:', data)
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

  // Calculate dots left (10 - blindDotsUsed)
  const dotsLeft = session ? Math.max(0, 10 - session.blindDotsUsed) : 0

  return (
    <>
      {/* Color Selection Modal */}
      {isSelectingColor && !session && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Choose your color</h2>
            <div className={styles.swatchGrid}>
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.name}
                  className={styles.swatch}
                  onClick={() => initSession(swatch.name)}
                  style={{ backgroundColor: swatch.hex }}
                  aria-label={swatch.name}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top-right Badge (Clickable) */}
      {session && (
        <button 
          className={styles.badge}
          onClick={() => {
            if (isRevealed) {
              setShowPurchaseModal(true)
            }
          }}
        >
          <div 
            className={styles.badgeSwatch}
            style={{ backgroundColor: session.colorHex }}
          />
          <div className={styles.badgeContent}>
            <span className={styles.badgeText}>
              {session.colorName} — {session.colorHex.toUpperCase()}
            </span>
            {!isRevealed && (
              <span className={styles.badgeSubtext}>
                Dots left: {dotsLeft}
              </span>
            )}
            {isRevealed && (
              <span className={styles.badgeSubtext}>
                Credits: {session.credits}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && session && isRevealed && (
        <div className={styles.modalOverlay} onClick={() => setShowPurchaseModal(false)}>
          <div className={styles.purchaseModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.purchaseModalHeader}>
              <h3 className={styles.purchaseModalTitle}>Buy Credits</h3>
              <button 
                className={styles.purchaseModalClose}
                onClick={() => setShowPurchaseModal(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.purchaseModalContent}>
              <p className={styles.currentCredits}>Current Credits: {session.credits}</p>
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
        </div>
      )}

      {/* Full Viewport Canvas */}
      {session && (
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
      )}
    </>
  )
}
