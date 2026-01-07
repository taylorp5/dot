'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

interface BufferedDot {
  x: number
  y: number
  clientDotId: string
}

export default function Home() {
  const [serverSession, setServerSession] = useState<Session | null>(null) // Server state (source of truth)
  const [localDots, setLocalDots] = useState<Dot[]>([]) // Blind phase dots (optimistic + confirmed)
  const [revealedDots, setRevealedDots] = useState<Dot[]>([]) // All dots after reveal
  
  // Derived: isRevealed from serverSession.revealed
  const isRevealed = serverSession?.revealed ?? false
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const [isSelectingColor, setIsSelectingColor] = useState(false)
  const [showPurchasePanel, setShowPurchasePanel] = useState(false)
  const [dotBuffer, setDotBuffer] = useState<BufferedDot[]>([]) // Buffer of dots to send in batch
  const [isFlushing, setIsFlushing] = useState(false) // Track if batch flush is in progress
  const [isRevealing, setIsRevealing] = useState(false) // Track if reveal is in progress
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  const BUFFER_FLUSH_SIZE = 5
  const BUFFER_FLUSH_DEBOUNCE_MS = 300
  
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
      const sessionId = localStorage.getItem('justadot_session_id')
      
      // Add temporary client logs
      console.log('[boot] sessionId from storage', sessionId)
      
      if (!sessionId) {
        // No sessionId in localStorage - show color picker
        setIsSelectingColor(true)
        return
      }

      try {
        // Fetch session from API to get latest state
        const response = await fetch(`/api/session/get?sessionId=${sessionId}`)
        const data = await response.json()

        if (!response.ok) {
          // Session not found (404) or other error - clear localStorage and show color picker
          if (response.status === 404) {
            localStorage.removeItem('justadot_session_id')
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
        
        // Add temporary client logs
        console.log('[boot] serverSession', restoredSession)

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
      // Store only sessionId in localStorage
      localStorage.setItem('justadot_session_id', newSession.sessionId)
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
      setIsSelectingColor(true)
    }
  }

  // Calculate remaining dots: purely derived from serverSession + buffer.length (computed every render)
  const remainingDots = serverSession && !isRevealed
    ? Math.max(0, 10 - serverSession.blindDotsUsed - dotBuffer.length)
    : 0

  // Instrumentation: log countdown inputs each render
  useEffect(() => {
    if (serverSession && !isRevealed) {
      console.log('[COUNTDOWN]', {
        blindDotsUsed: serverSession.blindDotsUsed,
        bufferLength: dotBuffer.length,
        remainingDots
      })
    }
  }, [serverSession?.blindDotsUsed, dotBuffer.length, remainingDots, isRevealed])

  // Auto-fetch all dots when revealed becomes true
  useEffect(() => {
    if (!serverSession?.revealed || !serverSession?.sessionId) return
    
    fetch(`/api/dots/all?sessionId=${serverSession.sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRevealedDots(data)
        }
      })
      .catch(error => {
        console.error('[CLIENT] Error fetching all dots on reveal:', error)
      })
  }, [serverSession?.revealed, serverSession?.sessionId])

  // Flush buffer: send buffered dots to server in batch
  const flushBuffer = useCallback(async () => {
    if (!serverSession || dotBuffer.length === 0 || isFlushing) {
      return
    }

    setIsFlushing(true)
    const bufferToSend = [...dotBuffer]
    setDotBuffer([]) // Clear buffer immediately

    try {
      const response = await fetch('/api/dots/place-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: serverSession.sessionId,
          dots: bufferToSend
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle NO_FREE_DOTS (409) - authoritative signal that blind phase is over
        if (response.status === 409 && data.error === 'NO_FREE_DOTS') {
          console.log('[CLIENT] NO_FREE_DOTS - triggering reveal sequence')
          
          // Stop accepting clicks (buffer is already cleared)
          // Trigger reveal sequence
          if (data.session) {
            const updatedSession: Session = {
              sessionId: data.session.sessionId,
              colorName: data.session.colorName,
              colorHex: data.session.colorHex,
              blindDotsUsed: data.session.blindDotsUsed,
              revealed: data.session.revealed,
              credits: data.session.credits
            }
            setServerSession(updatedSession)
          }
          
          await triggerReveal(serverSession.sessionId)
          
          // Rollback optimistic dots that weren't accepted
          if (!isRevealed) {
            const acceptedIds = new Set((data.accepted || []).map((d: any) => d.clientDotId))
            setLocalDots(prev => prev.filter(dot => 
              dot.sessionId !== serverSession.sessionId || 
              dot.phase !== 'blind' ||
              acceptedIds.has(dot.clientDotId)
            ))
          }
          return
        }

        // Handle INSUFFICIENT_CREDITS (400) - silently ignore
        if (response.status === 400 && data.error === 'INSUFFICIENT_CREDITS') {
          // Update session state
          if (data.session) {
            const updatedSession: Session = {
              sessionId: data.session.sessionId,
              colorName: data.session.colorName,
              colorHex: data.session.colorHex,
              blindDotsUsed: data.session.blindDotsUsed,
              revealed: data.session.revealed,
              credits: data.session.credits
            }
            setServerSession(updatedSession)
          }
          // Silently stop accepting clicks (no error logging)
          return
        }

        // Other errors: rollback optimistic dots
        if (!isRevealed) {
          const acceptedIds = new Set((data.acceptedDots || []).map((d: any) => d.clientDotId))
          setLocalDots(prev => prev.filter(dot => 
            dot.sessionId !== serverSession.sessionId || 
            dot.phase !== 'blind' ||
            acceptedIds.has(dot.clientDotId)
          ))
        }
        return
      }

      // Success: update serverSession from response (source of truth)
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

      // Remove optimistic dots that weren't accepted
      if (!isRevealed) {
        const acceptedIds = new Set((data.acceptedDots || []).map((d: any) => d.clientDotId))
        setLocalDots(prev => prev.filter(dot => 
          dot.sessionId !== serverSession.sessionId || 
          dot.phase !== 'blind' ||
          acceptedIds.has(dot.clientDotId)
        ))
      }

      // Auto-reveal: if revealed became true (or blindDotsUsed >= 10), fetch all dots
      // Important: do NOT call /api/dots/all before session.revealed is true
      if (updatedSession.revealed) {
        if (!serverSession.revealed) {
          console.log('[CLIENT] Auto-revealing (revealed === true), fetching all dots')
          setLocalDots([]) // Clear local dots
        }
        // Fetch all dots - session is revealed
        await fetchAllDots(updatedSession.sessionId)
      } else if (updatedSession.blindDotsUsed >= 10 && !updatedSession.revealed) {
        // Edge case: blindDotsUsed >= 10 but revealed not set yet
        // This shouldn't happen if server logic is correct, but handle it anyway
        console.log('[CLIENT] Blind dots complete but not revealed, triggering reveal sequence')
        await triggerReveal(updatedSession.sessionId)
      }
    } catch (error) {
      console.error('[CLIENT] Error flushing buffer:', error)
      // On error, keep buffer (it was already cleared, so restore it)
      setDotBuffer(bufferToSend)
    } finally {
      setIsFlushing(false)
    }
  }, [serverSession, isRevealed])

  // Debounced flush: send buffer after debounce period or when buffer reaches size limit
  useEffect(() => {
    // Clear existing timeout
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }

    // If buffer is empty or flushing, do nothing
    if (dotBuffer.length === 0 || isFlushing || !serverSession) {
      return
    }

    // If buffer reaches size limit, flush immediately
    if (dotBuffer.length >= BUFFER_FLUSH_SIZE) {
      flushBuffer()
      return
    }

    // Otherwise, set debounced flush
    flushTimeoutRef.current = setTimeout(() => {
      flushBuffer()
    }, BUFFER_FLUSH_DEBOUNCE_MS)

    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
    }
  }, [dotBuffer.length, isFlushing, serverSession?.sessionId, flushBuffer])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!serverSession || !canvasRef.current || isRevealing || isFlushing) {
      return
    }

    // Strict state machine: gate clicks based on phase
    if (!isRevealed) {
      // Blind phase: only allow if remaining dots > 0 (accounting for buffer)
      if (remainingDots === 0) {
        // Silently ignore - no dots remaining
        return
      }
    } else {
      // Revealed phase: only allow if credits > 0
      if (serverSession.credits <= 0) {
        // Silently ignore - no credits
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
    }

    // Add to buffer (will be flushed via debounce or size limit)
    setDotBuffer(prev => [...prev, { x: xNorm, y: yNorm, clientDotId }])
  }

  // Reveal sequence: POST /api/session/reveal → GET /api/session/get → GET /api/dots/all
  const triggerReveal = async (sessionId: string) => {
    if (isRevealing) {
      console.log('[CLIENT] Reveal already in progress, skipping')
      return
    }

    setIsRevealing(true)
    try {
      // Step 1: POST /api/session/reveal
      const revealResponse = await fetch('/api/session/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      if (!revealResponse.ok) {
        const revealData = await revealResponse.json()
        console.error('[CLIENT] Reveal failed:', revealData.error)
        setIsRevealing(false)
        return
      }

      // Step 2: GET /api/session/get to refresh session state
      const sessionResponse = await fetch(`/api/session/get?sessionId=${sessionId}`)
      const sessionData = await sessionResponse.json()

      if (!sessionResponse.ok) {
        console.error('[CLIENT] Failed to refresh session after reveal:', sessionData.error)
        setIsRevealing(false)
        return
      }

      // Update session state
      const refreshedSession: Session = {
        sessionId: sessionData.sessionId,
        colorName: sessionData.colorName,
        colorHex: sessionData.colorHex,
        blindDotsUsed: sessionData.blindDotsUsed,
        revealed: sessionData.revealed,
        credits: sessionData.credits
      }

      setServerSession(refreshedSession)

      // Step 3: Only after revealed is confirmed true, fetch all dots
      if (refreshedSession.revealed) {
        await fetchAllDots(sessionId)
      }
    } catch (error) {
      console.error('[CLIENT] Error in reveal sequence:', error)
    } finally {
      setIsRevealing(false)
    }
  }

  const fetchAllDots = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/dots/all?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        // If 403, session might not be revealed yet - retry after fetching session state
        if (response.status === 403) {
          console.log('[CLIENT] 403 from /api/dots/all, fetching session state and retrying')
          const sessionResponse = await fetch(`/api/session/get?sessionId=${sessionId}`)
          const sessionData = await sessionResponse.json()
          
          if (sessionResponse.ok && sessionData.revealed) {
            // Retry fetching dots
            const retryResponse = await fetch(`/api/dots/all?sessionId=${sessionId}`)
            const retryData = await retryResponse.json()
            if (retryResponse.ok) {
              setRevealedDots(retryData)
            }
          }
        } else {
          console.error('Error fetching dots:', data.error)
        }
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
          onClick={() => setShowPurchasePanel(prev => !prev)}
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

      {/* Purchase Panel (Popover) */}
      {showPurchasePanel && session && isRevealed && (
        <>
          {/* Click-outside overlay */}
          <div 
            className={styles.panelOverlay}
            onClick={() => setShowPurchasePanel(false)}
          />
          {/* Purchase Panel */}
          <div className={styles.purchasePanel}>
            <div className={styles.purchasePanelHeader}>
              <h3 className={styles.purchasePanelTitle}>Buy Credits</h3>
              <button 
                className={styles.purchasePanelClose}
                onClick={() => setShowPurchasePanel(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.purchasePanelContent}>
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
        </>
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
