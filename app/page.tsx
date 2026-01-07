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
  phase: 'blind' | 'paid' // Set at enqueue time, not computed later
  x: number
  y: number
  clientW: number
  clientH: number
  resolve: (session: Session) => void
  reject: (error: any) => void
}

export default function Home() {
  const [serverSession, setServerSession] = useState<Session | null>(null) // Server state (source of truth)
  const [localDots, setLocalDots] = useState<Dot[]>([]) // Blind phase dots (optimistic + confirmed)
  const [revealedDots, setRevealedDots] = useState<Dot[]>([]) // All dots after reveal
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const [isSelectingColor, setIsSelectingColor] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [pendingPlacements, setPendingPlacements] = useState<PendingDotPlacement[]>([])
  const [inFlightCount, setInFlightCount] = useState(0)
  const [pendingBlindIds, setPendingBlindIds] = useState<Set<string>>(new Set()) // Set of in-flight blind dot clientDotIds
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  const MAX_IN_FLIGHT = 3
  
  // Derived: size of pending blind dots set
  const pendingBlindSize = pendingBlindIds.size
  
  // Alias for backward compatibility
  const session = serverSession

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

        setServerSession(restoredSession)
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

            setServerSession(updatedSession)
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

      setServerSession(newSession)
      setIsRevealed(newSession.revealed)
      localStorage.setItem('dotSession', JSON.stringify(newSession))
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
      setIsSelectingColor(true)
    }
  }

  // Calculate remaining dots: purely derived from serverSession + pendingBlindSize (computed every render)
  const remainingDots = serverSession && !isRevealed
    ? Math.max(0, 10 - serverSession.blindDotsUsed - pendingBlindSize)
    : 0

  // Instrumentation: log countdown inputs each render
  useEffect(() => {
    if (serverSession && !isRevealed) {
      console.log('[COUNTDOWN]', {
        blindDotsUsed: serverSession.blindDotsUsed,
        pendingBlindSize,
        remainingDots,
        pendingBlindIds: Array.from(pendingBlindIds)
      })
    }
  }, [serverSession?.blindDotsUsed, pendingBlindSize, remainingDots, pendingBlindIds, isRevealed])

  // Process queue: execute up to MAX_IN_FLIGHT concurrent requests
  useEffect(() => {
    if (inFlightCount >= MAX_IN_FLIGHT || pendingPlacements.length === 0) {
      return
    }

    const processNext = async () => {
      const next = pendingPlacements[0]
      if (!next || !serverSession) return

      // Capture clientDotId and phase at the start (from request object, not computed)
      const requestClientDotId = next.clientDotId
      const requestPhase = next.phase
      
      setInFlightCount(prev => prev + 1)
      setPendingPlacements(prev => prev.slice(1))

      try {
        const response = await fetch('/api/dots/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: serverSession.sessionId,
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
            
            // Update serverSession from response (source of truth)
            if (data.session) {
              const updatedSession: Session = {
                sessionId: data.session.sessionId,
                colorName: data.session.colorName,
                colorHex: data.session.colorHex,
                blindDotsUsed: data.session.blindDotsUsed,
                revealed: data.session.revealed,
                credits: data.session.credits
              }
              
              // Prevent out-of-order overwrites: only accept if blindDotsUsed >= current
              setServerSession(prev => {
                if (!prev || updatedSession.blindDotsUsed >= prev.blindDotsUsed) {
                  return updatedSession
                }
                return prev
              })
              
              setIsRevealed(updatedSession.revealed)
              localStorage.setItem('dotSession', JSON.stringify(updatedSession))

              // Rollback extra optimistic dots beyond allowed
              if (!isRevealed) {
                setLocalDots(prev => {
                  // Keep only the first (10 - blindDotsUsed) dots for this session
                  const allowedCount = 10 - updatedSession.blindDotsUsed
                  const sessionDots = prev.filter(dot => dot.sessionId === updatedSession.sessionId && dot.phase === 'blind')
                  const otherDots = prev.filter(dot => dot.sessionId !== updatedSession.sessionId || dot.phase !== 'blind')
                  return [...otherDots, ...sessionDots.slice(0, allowedCount)]
                })
              }

              // Trigger auto-reveal if needed
              if (updatedSession.blindDotsUsed >= 10 && updatedSession.revealed) {
                console.log('[CLIENT] Auto-revealing, fetching all dots')
                setLocalDots([])
                await fetchAllDots(updatedSession.sessionId)
              }
            }

            // Stop accepting new blind dots (remaining will become 0)
            setPendingPlacements(prev => prev.filter(p => p.clientDotId !== next.clientDotId))
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

        // Success: update serverSession from server response (source of truth)
        const updatedSession: Session = {
          sessionId: data.sessionId,
          colorName: data.colorName,
          colorHex: data.colorHex,
          blindDotsUsed: data.blindDotsUsed,
          revealed: data.revealed,
          credits: data.credits
        }

        // Prevent out-of-order overwrites: only accept if blindDotsUsed >= current
        setServerSession(prev => {
          if (!prev || updatedSession.blindDotsUsed >= prev.blindDotsUsed) {
            return updatedSession
          }
          return prev
        })
        
        setIsRevealed(updatedSession.revealed)
        localStorage.setItem('dotSession', JSON.stringify(updatedSession))

        // Handle auto-reveal
        if (!serverSession.revealed && updatedSession.revealed) {
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
      } finally {
        // Remove pending ID in finally block (exactly once per request)
        // Use request.phase from request object (set at enqueue time), not computed isBlindRequest
        if (requestPhase === 'blind') {
          setPendingBlindIds(prev => {
            const nextSet = new Set(prev)
            nextSet.delete(requestClientDotId) // Use captured variable, not next.clientDotId
            console.log('[PENDING REMOVE]', requestClientDotId, 'size', nextSet.size)
            return nextSet
          })
        }
      }
    }

    processNext()
  }, [pendingPlacements, inFlightCount, serverSession, isRevealed])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!serverSession || !canvasRef.current) {
      return
    }

    // Gate clicks: if in blind phase, check remaining dots (purely derived)
    if (!isRevealed) {
      if (remainingDots === 0) {
        // Silently ignore - no dots remaining
        return
      }
    }

    // Compute normalized coordinates
    const rect = canvasRef.current.getBoundingClientRect()
    let xNorm = (e.clientX - rect.left) / rect.width
    let yNorm = (e.clientY - rect.top) / rect.height
    xNorm = Math.max(0, Math.min(1, xNorm))
    yNorm = Math.max(0, Math.min(1, yNorm))

    // Generate client dot ID for idempotency
    const clientDotId = crypto.randomUUID()

    // Determine phase at enqueue time (not computed later)
    const requestPhase: 'blind' | 'paid' = isRevealed ? 'paid' : 'blind'

    // Optimistic UI: immediately append dot to localDots (only in blind phase)
    if (!isRevealed) {
      const optimisticDot: Dot = {
        sessionId: serverSession.sessionId,
        x: xNorm,
        y: yNorm,
        colorHex: serverSession.colorHex,
        phase: 'blind',
        createdAt: new Date().toISOString(),
        clientDotId
      }
      setLocalDots(prev => [...prev, optimisticDot])
      
      // Add pending ID immediately when enqueuing (exactly once)
      setPendingBlindIds(prev => {
        const nextSet = new Set(prev)
        nextSet.add(clientDotId)
        console.log('[PENDING ADD]', clientDotId, 'size', nextSet.size)
        return nextSet
      })
    }

    // Queue the request with phase set at enqueue time
    const placementPromise = new Promise<Session>((resolve, reject) => {
      setPendingPlacements(prev => [...prev, {
        clientDotId,
        phase: requestPhase, // Set at enqueue time, not computed later
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

      setServerSession(updatedSession)
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
