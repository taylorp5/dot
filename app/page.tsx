'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './page.module.css'
import { STRIPE_PRICES } from '@/lib/stripe-prices'
import { COLOR_SWATCHES } from '@/lib/color-swatches'
import Canvas from './components/Canvas'

interface Session {
  sessionId: string
  colorName: string
  colorHex: string
  blindDotsUsed: number
  revealed: boolean
  credits: number
}

interface Dot {
  sessionId: string
  x: number
  y: number
  colorHex: string
  phase: 'blind' | 'paid'
  createdAt: string
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [localDots, setLocalDots] = useState<Dot[]>([]) // Blind phase dots (optimistic + confirmed)
  const [revealedDots, setRevealedDots] = useState<Dot[]>([]) // All dots after reveal
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const [isSelectingColor, setIsSelectingColor] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [isPlacing, setIsPlacing] = useState(false) // Lock to prevent duplicate placements
  const canvasContainerRef = useRef<HTMLDivElement>(null) // For click coordinate calculation


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
        // If not revealed, canvas stays blank (localDots starts empty)
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

  // Calculate remaining dots from server state (single source of truth)
  const remainingDots = session 
    ? Math.max(0, 10 - session.blindDotsUsed)
    : 0

  const handlePointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!session || !canvasContainerRef.current || isPlacing) {
      console.log('[CLIENT] Ignoring pointerdown:', { 
        hasSession: !!session, 
        hasContainer: !!canvasContainerRef.current, 
        isPlacing 
      })
      return
    }

    // Prevent placement if no dots remaining and not revealed
    if (!isRevealed && remainingDots === 0) {
      console.log('[CLIENT] No dots remaining, ignoring click')
      return
    }

    // PERMANENT FIX: Use container.getBoundingClientRect() for accurate coordinates
    const rect = canvasContainerRef.current.getBoundingClientRect()
    // Compute normalized coordinates [0,1]
    let xNorm = (e.clientX - rect.left) / rect.width
    let yNorm = (e.clientY - rect.top) / rect.height
    
    // Clamp to [0,1] (client-side validation before sending)
    xNorm = Math.max(0, Math.min(1, xNorm))
    yNorm = Math.max(0, Math.min(1, yNorm))

    console.log('[CLIENT] Placing dot:', { 
      sessionId: session.sessionId, 
      remaining: remainingDots, 
      isPlacing: false,
      x: xNorm, 
      y: yNorm 
    })

    // Set lock immediately to prevent duplicate requests
    setIsPlacing(true)

    // Optimistic UI: Add dot immediately to localDots (only in blind phase)
    const optimisticDot: Dot = {
      sessionId: session.sessionId,
      x: xNorm,
      y: yNorm,
      colorHex: session.colorHex,
      phase: 'blind',
      createdAt: new Date().toISOString()
    }

    if (!isRevealed) {
      setLocalDots(prev => [...prev, optimisticDot])
    }

    try {
      const response = await fetch('/api/dots/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          x: xNorm,
          y: yNorm,
          clientW: rect.width,  // Optional: for debugging/auditing
          clientH: rect.height  // Optional: for debugging/auditing
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Remove optimistic dot on failure
        if (!isRevealed) {
          setLocalDots(prev => prev.slice(0, -1))
        }
        
        // Handle NO_FREE_DOTS error silently (no alert)
        if (response.status === 409 && data.error === 'NO_FREE_DOTS') {
          console.log('[CLIENT] No free dots left, server confirmed')
          // Update session from response if provided
          if (data.session) {
            const updatedSession: Session = {
              sessionId: data.session.sessionId,
              colorName: data.session.colorName,
              colorHex: data.session.colorHex,
              blindDotsUsed: data.session.blindDotsUsed,
              revealed: data.session.revealed,
              credits: data.session.credits
            }
            setSession(updatedSession)
            setIsRevealed(updatedSession.revealed)
            localStorage.setItem('dotSession', JSON.stringify(updatedSession))
          }
        } else {
          // Other errors: show alert
          alert(data.error || 'Failed to place dot')
        }
        setIsPlacing(false)
        return
      }

      // Update session from server response (single source of truth)
      const updatedSession: Session = {
        sessionId: data.sessionId,
        colorName: data.colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      console.log('[CLIENT] Dot placed successfully:', {
        sessionId: updatedSession.sessionId,
        blindDotsUsed: updatedSession.blindDotsUsed,
        revealed: updatedSession.revealed,
        remaining: Math.max(0, 10 - updatedSession.blindDotsUsed)
      })

      setSession(updatedSession)
      localStorage.setItem('dotSession', JSON.stringify(updatedSession))

      // Handle auto-reveal: when blind dots reach 10, fetch all dots
      if (!session.revealed && updatedSession.revealed) {
        console.log('[CLIENT] Auto-revealing, fetching all dots')
        // Fetch all dots BEFORE setting isRevealed to true
        // This ensures revealedDots is populated before canvas switches to it
        await fetchAllDots(updatedSession.sessionId)
        // Now set revealed state and clear local dots
        setIsRevealed(true)
        setLocalDots([])
      } else {
        // Not auto-revealing, just update revealed state normally
        setIsRevealed(updatedSession.revealed)
      }
      
      setIsPlacing(false)
    } catch (error) {
      // Remove optimistic dot on error
      if (!isRevealed) {
        setLocalDots(prev => prev.slice(0, -1))
      }
      console.error('[CLIENT] Error placing dot:', error)
      alert('Failed to place dot')
      setIsPlacing(false)
    }
  }

  const fetchAllDots = async (sessionId: string, retryCount = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 500 // 500ms delay between retries

    try {
      console.log('[CLIENT] Fetching all dots for session:', sessionId, `(attempt ${retryCount + 1})`)
      const response = await fetch(`/api/dots/all?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('[CLIENT] Error fetching dots:', data.error)
        return
      }

      // IMPORTANT: Do NOT filter dots by sessionId - we want ALL dots including the current user's
      // The filter below is ONLY for logging/counting purposes
      const userDotsCount = data.filter((dot: Dot) => dot.sessionId === sessionId).length
      
      console.log('[reveal] dots fetched', data.length, data[0])
      console.log('[CLIENT] Fetched dots:', {
        count: data.length,
        phases: data.reduce((acc: Record<string, number>, dot: Dot) => {
          acc[dot.phase] = (acc[dot.phase] || 0) + 1
          return acc
        }, {}),
        userDots: userDotsCount
      })

      // If we just revealed and don't see our 10 dots yet, retry after a short delay
      // This handles potential database read consistency delays
      // Note: We check if we have fewer than 10 dots for this session, which suggests
      // the database might not have fully committed all dots yet
      if (retryCount < MAX_RETRIES && userDotsCount < 10) {
        console.log(`[CLIENT] Only found ${userDotsCount} user dots (expected 10), retrying in ${RETRY_DELAY}ms...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return fetchAllDots(sessionId, retryCount + 1)
      }

      // Set ALL dots without any filtering - includes current user's dots and all others
      setRevealedDots(data)
    } catch (error) {
      console.error('[CLIENT] Error fetching all dots:', error)
      // Retry on network errors
      if (retryCount < MAX_RETRIES) {
        console.log(`[CLIENT] Retrying fetch after error in ${RETRY_DELAY}ms...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return fetchAllDots(sessionId, retryCount + 1)
      }
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
    { priceId: STRIPE_PRICES.CREDITS_50, credits: 50, price: 0.50, label: '50 Credits - $0.50' },
    { priceId: STRIPE_PRICES.CREDITS_100, credits: 100, price: 1.00, label: '100 Credits - $1.00' },
    { priceId: STRIPE_PRICES.CREDITS_500, credits: 500, price: 5.00, label: '500 Credits - $5.00' },
  ]

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
                  onClick={() => initSession(swatch.name.toLowerCase())} // Send lowercase canonical name
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
              {session.colorName.charAt(0).toUpperCase() + session.colorName.slice(1)} — {session.colorHex.toUpperCase()}
            </span>
            {!isRevealed && (
              <span className={styles.badgeSubtext}>
                Dots left: {remainingDots}
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

      {/* Debug Counter */}
      {session && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}
        >
          Rendered: {isRevealed ? revealedDots.length : localDots.length}
        </div>
      )}

      {/* Full Viewport Canvas */}
      {session && (
        <div
          ref={canvasContainerRef}
          onPointerDown={handlePointerDown}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            zIndex: 1
          }}
        >
          <Canvas dots={isRevealed ? revealedDots : localDots} />
        </div>
      )}
    </>
  )
}
