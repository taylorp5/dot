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
  sessionId: string
  x: number
  y: number
  colorHex: string
  phase: 'blind' | 'paid'
  createdAt: string
  clientDotId?: string // For optimistic UI reconciliation
}

interface PendingDotPlacement {
  clientDotId: string
  x: number
  y: number
  clientW: number
  clientH: number
  resolve: (session: Session) => void
  reject: (error: any) => void
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
  const [optimisticRemaining, setOptimisticRemaining] = useState<number | null>(null) // Optimistic counter for display
  const [pendingPlacements, setPendingPlacements] = useState<PendingDotPlacement[]>([])
  const [inFlightCount, setInFlightCount] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  const MAX_IN_FLIGHT = 3

  // Setup canvas with DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvasContainerRef.current
    if (!canvas || !container) return

    const setupCanvas = () => {
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

      // Scale context to handle DPR
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        redrawCanvas(ctx, cssW, cssH)
      }
    }

    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [localDots, revealedDots, isRevealed])

  // Redraw canvas when dots change
  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvasContainerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (ctx) {
      redrawCanvas(ctx, rect.width, rect.height)
    }
  }, [localDots, revealedDots, isRevealed])

  const redrawCanvas = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    // Clear canvas
    ctx.clearRect(0, 0, cssW, cssH)

    // Determine which dots to draw
    const dotsToDraw = isRevealed ? revealedDots : localDots

    // Draw all dots
    dotsToDraw.forEach((dot) => {
      const px = dot.x * cssW
      const py = dot.y * cssH

      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fillStyle = dot.colorHex
      ctx.fill()
    })
  }

  // Load session from localStorage on mount and fetch from API
  useEffect(() => {
    const loadSession = async () => {
      // Read sessionId from localStorage
      const savedSession = localStorage.getItem('dotSession')
      if (!savedSession) {
        setIsSelectingColor(true)
        return
      }

      try {
        const parsed = JSON.parse(savedSession)
        const sessionId = parsed.sessionId

        if (!sessionId) {
          setIsSelectingColor(true)
          return
        }

        // Fetch session from API to get latest state
        const response = await fetch(`/api/session/get?sessionId=${sessionId}`)
        const data = await response.json()

        if (!response.ok) {
          // Session not found (404) or other error - show color picker
          if (response.status === 404) {
            localStorage.removeItem('dotSession')
          }
          setIsSelectingColor(true)
          return
        }

        // Set session state immediately
        const restoredSession: Session = {
          sessionId: data.sessionId,
          colorName: data.colorName,
          colorHex: data.colorHex,
          blindDotsUsed: data.blindDotsUsed,
          revealed: data.revealed,
          credits: data.credits
        }

        setSession(restoredSession)
        setIsRevealed(restoredSession.revealed)
        localStorage.setItem('dotSession', JSON.stringify(restoredSession))

        // If revealed, fetch all dots
        if (restoredSession.revealed) {
          fetchAllDots(restoredSession.sessionId)
        }

        // Check for Stripe success redirect
        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')

        if (success === '1') {
          // Refetch session to get updated credits after Stripe payment
          const refreshResponse = await fetch(`/api/session/get?sessionId=${sessionId}`)
          const refreshData = await refreshResponse.json()

          if (refreshResponse.ok) {
            const updatedSession: Session = {
              sessionId: refreshData.sessionId,
              colorName: refreshData.colorName,
              colorHex: refreshData.colorHex,
              blindDotsUsed: refreshData.blindDotsUsed,
              revealed: refreshData.revealed,
              credits: refreshData.credits
            }

            setSession(updatedSession)
            setIsRevealed(updatedSession.revealed)
            localStorage.setItem('dotSession', JSON.stringify(updatedSession))
          }

          // Clean up URL param
          window.history.replaceState({}, '', window.location.pathname)
        } else {
          // Clean up any other query params
          const canceled = params.get('canceled')
          if (canceled === '1') {
            window.history.replaceState({}, '', window.location.pathname)
          }
        }
      } catch (e) {
        console.error('Error loading session:', e)
        setIsSelectingColor(true)
      }
    }

    loadSession()
  }, [])

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

  // Calculate remaining dots: use optimistic counter if available, otherwise server state
  const remainingDots = optimisticRemaining !== null
    ? optimisticRemaining
    : (session ? Math.max(0, 10 - session.blindDotsUsed) : 0)
  
  // Sync optimistic counter with server state when session updates
  useEffect(() => {
    if (session && !isRevealed) {
      // Reconcile: server state minus pending placements
      const serverRemaining = Math.max(0, 10 - session.blindDotsUsed)
      const pendingCount = pendingPlacements.length
      setOptimisticRemaining(Math.max(0, serverRemaining - pendingCount))
    } else {
      setOptimisticRemaining(null)
    }
  }, [session?.blindDotsUsed, pendingPlacements.length, isRevealed])

  // Process queue: execute up to MAX_IN_FLIGHT concurrent requests
  useEffect(() => {
    if (inFlightCount >= MAX_IN_FLIGHT || pendingPlacements.length === 0) {
      return
    }

    const processNext = async () => {
      const next = pendingPlacements[0]
      if (!next || !session) return

      setInFlightCount(prev => prev + 1)
      setPendingPlacements(prev => prev.slice(1))

      try {
        const response = await fetch('/api/dots/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            x: next.x,
            y: next.y,
            clientW: next.clientW,
            clientH: next.clientH,
            clientDotId: next.clientDotId
          })
        })

        const data = await response.json()

        if (!response.ok) {
          // Handle NO_FREE_DOTS error
          if (response.status === 409 && data.error === 'NO_FREE_DOTS') {
            console.log('[CLIENT] No free dots left, server confirmed')
            
            // Remove optimistic dots beyond allowed count
            if (!isRevealed) {
              setLocalDots(prev => {
                // Keep only dots that have been confirmed by server
                // For now, remove the failed dot
                return prev.filter(dot => dot.clientDotId !== next.clientDotId)
              })
            }

            // Update session from response
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

            // Stop accepting new blind dots
            setPendingPlacements([])
            next.reject(new Error('NO_FREE_DOTS'))
          } else {
            // Other errors: remove optimistic dot
            if (!isRevealed) {
              setLocalDots(prev => prev.filter(dot => dot.clientDotId !== next.clientDotId))
            }
            next.reject(new Error(data.error || 'Failed to place dot'))
          }
          setInFlightCount(prev => prev - 1)
          return
        }

        // Success: update session from server response
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

        // Handle auto-reveal
        if (!session.revealed && updatedSession.revealed) {
          console.log('[CLIENT] Auto-revealing, fetching all dots')
          setLocalDots([])
          await fetchAllDots(updatedSession.sessionId)
        }

        next.resolve(updatedSession)
        setInFlightCount(prev => prev - 1)
      } catch (error) {
        // Remove optimistic dot on error
        if (!isRevealed) {
          setLocalDots(prev => prev.filter(dot => dot.clientDotId !== next.clientDotId))
        }
        console.error('[CLIENT] Error placing dot:', error)
        next.reject(error)
        setInFlightCount(prev => prev - 1)
      }
    }

    processNext()
  }, [pendingPlacements, inFlightCount, session, isRevealed])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!session || !canvasRef.current) {
      return
    }

    // If in blind phase and remainingDots <= 0, ignore silently
    if (!isRevealed && remainingDots <= 0) {
      return
    }

    // Compute normalized coordinates
    const rect = canvasRef.current.getBoundingClientRect()
    let xNorm = (e.clientX - rect.left) / rect.width
    let yNorm = (e.clientY - rect.top) / rect.height
    xNorm = Math.max(0, Math.min(1, xNorm))
    yNorm = Math.max(0, Math.min(1, yNorm))

    // Generate client dot ID for idempotency
    const clientDotId = crypto.randomUUID()

    // Immediately append dot to localDots (optimistic UI)
    if (!isRevealed) {
      const optimisticDot: Dot = {
        sessionId: session.sessionId,
        x: xNorm,
        y: yNorm,
        colorHex: session.colorHex,
        phase: 'blind',
        createdAt: new Date().toISOString(),
        clientDotId
      }
      setLocalDots(prev => [...prev, optimisticDot])
    }

    // Immediately decrement optimistic counter
    if (!isRevealed) {
      setOptimisticRemaining(prev => Math.max(0, (prev ?? remainingDots) - 1))
    }

    // Queue the request
    const placementPromise = new Promise<Session>((resolve, reject) => {
      setPendingPlacements(prev => [...prev, {
        clientDotId,
        x: xNorm,
        y: yNorm,
        clientW: rect.width,
        clientH: rect.height,
        resolve,
        reject
      }])
    })

    // Handle promise (for error handling if needed)
    placementPromise.catch(error => {
      console.error('[CLIENT] Placement failed:', error)
    })
  }

  const fetchAllDots = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/dots/all?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Error fetching dots:', data.error)
        return
      }

      setRevealedDots(data)
    } catch (error) {
      console.error('Error fetching all dots:', error)
    }
  }

  const fetchSessionSnapshot = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/session/get?sessionId=${sessionId}`)
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
                      onClick={() => initSession(swatch.name.toLowerCase())}
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

      {/* Full Viewport Canvas */}
      {session && (
        <div
          ref={canvasContainerRef}
          className={styles.canvasContainer}
        >
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onPointerDown={handlePointerDown}
          />
        </div>
      )}
    </>
  )
}
