'use client'

import { useState, useEffect, useRef } from 'react'
import { COLOR_SWATCHES } from '@/lib/color-swatches'
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
  colorHex: string
  phase: 'blind' | 'paid'
  sessionId?: string
  clientDotId?: string
  createdAt?: string
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [myBlindDots, setMyBlindDots] = useState<Dot[]>([]) // Only this session's blind dots
  const [revealedDots, setRevealedDots] = useState<Dot[]>([]) // All dots after reveal
  const [showBuyPanel, setShowBuyPanel] = useState(false)
  const [isPlacing, setIsPlacing] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const clickableAreaRef = useRef<HTMLDivElement>(null)

  // Hydrate session from localStorage on mount
  useEffect(() => {
    const sessionId = localStorage.getItem('justadot_session_id')
    
    if (!sessionId) {
      setShowColorPicker(true)
      setIsLoading(false)
      return
    }

    // Fetch session from API
    fetch(`/api/session/get?sessionId=${sessionId}`)
      .then(async (res) => {
        if (res.status === 404) {
          // Session not found, clear localStorage and show color picker
          localStorage.removeItem('justadot_session_id')
          setShowColorPicker(true)
          setIsLoading(false)
          return
        }

        if (!res.ok) {
          console.error('Error fetching session:', await res.json())
          setIsLoading(false)
          return
        }

        const data = await res.json()
        const hydratedSession: Session = {
          sessionId: data.sessionId,
          colorName: '', // Not returned by API
          colorHex: data.colorHex,
          blindDotsUsed: data.blindDotsUsed,
          revealed: data.revealed,
          credits: data.credits
        }
        
        setSession(hydratedSession)
        
        // Always fetch user's own dots (for blind mode persistence)
        fetchMyDots(hydratedSession.sessionId)
        
        // If revealed, fetch all dots
        if (hydratedSession.revealed) {
          fetchAllDots(hydratedSession.sessionId)
        }
        
        setIsLoading(false)
      })
      .catch((error) => {
        console.error('Error fetching session:', error)
        setIsLoading(false)
      })
  }, [])

  // Monitor session state for reveal trigger
  useEffect(() => {
    if (session && session.revealed && revealedDots.length === 0) {
      // Fetch all dots exactly once when revealed
      fetchAllDots(session.sessionId)
    }
  }, [session?.revealed])

  // Handle Stripe success redirect
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    
    if (success === '1' && session) {
      // Refetch session to get updated credits
      fetch(`/api/session/get?sessionId=${session.sessionId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json()
            setSession({
              sessionId: data.sessionId,
              colorName: session.colorName,
              colorHex: data.colorHex,
              blindDotsUsed: data.blindDotsUsed,
              revealed: data.revealed,
              credits: data.credits
            })
          }
        })
        .catch(console.error)
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [session])

  const fetchMyDots = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/dots/mine?sessionId=${sessionId}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Error fetching my dots:', data.error)
        return
      }

      // Map to Dot interface format
      const dots: Dot[] = data.map((dot: any) => ({
        x: dot.x,
        y: dot.y,
        colorHex: dot.colorHex,
        phase: dot.phase,
        createdAt: dot.createdAt
      }))

      setMyBlindDots(dots)
    } catch (error) {
      console.error('Error fetching my dots:', error)
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

      // Map to Dot interface format
      const dots: Dot[] = data.map((dot: any) => ({
        x: dot.x,
        y: dot.y,
        colorHex: dot.colorHex,
        phase: dot.phase,
        sessionId: dot.sessionId,
        createdAt: dot.createdAt
      }))

      setRevealedDots(dots)
    } catch (error) {
      console.error('Error fetching all dots:', error)
    }
  }

  const handleColorSelect = async (colorName: string) => {
    try {
      const response = await fetch('/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorName: colorName.toLowerCase() })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to initialize session')
        return
      }

      const newSession: Session = {
        sessionId: data.sessionId,
        colorName: colorName, // Use the selected color name
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      setSession(newSession)
      setMyBlindDots([]) // Clear blind dots for new session
      localStorage.setItem('justadot_session_id', newSession.sessionId)
      setShowColorPicker(false)
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
    }
  }

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!session || !clickableAreaRef.current || isPlacing) {
      return
    }

    // Only allow clicks in blind mode (not revealed)
    if (session.revealed) {
      return
    }

    // Prevent placement if no dots remaining
    const remainingDots = Math.max(0, 10 - session.blindDotsUsed)
    if (remainingDots <= 0) {
      // Ignore silently
      return
    }

    // Get normalized coordinates from getBoundingClientRect()
    const rect = clickableAreaRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    // Clamp to [0,1]
    const xNorm = Math.max(0, Math.min(1, x))
    const yNorm = Math.max(0, Math.min(1, y))

    // Generate client dot ID for optimistic update
    const clientDotId = `client-${Date.now()}-${Math.random()}`

    // Immediately add optimistic dot to myBlindDots
    const optimisticDot: Dot = {
      x: xNorm,
      y: yNorm,
      colorHex: session.colorHex,
      phase: 'blind',
      clientDotId: clientDotId
    }
    setMyBlindDots(prev => [...prev, optimisticDot])

    setIsPlacing(true)

    try {
      const response = await fetch('/api/dots/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          x: xNorm,
          y: yNorm,
          clientDotId: clientDotId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Remove optimistic dot on failure
        setMyBlindDots(prev => prev.filter(dot => dot.clientDotId !== clientDotId))
        
        if (response.status === 409 && data.error === 'NO_FREE_DOTS') {
          // Update session from response
          if (data.session) {
            setSession({
              sessionId: data.session.sessionId,
              colorName: session.colorName,
              colorHex: data.session.colorHex,
              blindDotsUsed: data.session.blindDotsUsed,
              revealed: data.session.revealed,
              credits: data.session.credits
            })
            localStorage.setItem('justadot_session_id', data.session.sessionId)
          }
        } else {
          alert(data.error || 'Failed to place dot')
        }
        setIsPlacing(false)
        return
      }

      // Update session from response (authoritative)
      if (data.session) {
        const updatedSession: Session = {
          sessionId: data.session.sessionId,
          colorName: session.colorName,
          colorHex: data.session.colorHex,
          blindDotsUsed: data.session.blindDotsUsed,
          revealed: data.session.revealed,
          credits: data.session.credits
        }

        setSession(updatedSession)
        localStorage.setItem('justadot_session_id', updatedSession.sessionId)

        // If revealed, fetch all dots exactly once
        if (updatedSession.revealed && !session.revealed) {
          await fetchAllDots(updatedSession.sessionId)
        } else {
          // Refresh my dots to get server-confirmed version
          await fetchMyDots(updatedSession.sessionId)
        }
      }

      setIsPlacing(false)
    } catch (error) {
      // Remove optimistic dot on error
      setMyBlindDots(prev => prev.filter(dot => dot.clientDotId !== clientDotId))
      console.error('Error placing dot:', error)
      alert('Failed to place dot')
      setIsPlacing(false)
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

  const remainingDots = session ? Math.max(0, 10 - session.blindDotsUsed) : 0

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'white',
        width: '100vw',
        height: '100vh'
      }} />
    )
  }

  return (
    <>
      {/* Color Picker Modal */}
      {showColorPicker && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
            minWidth: '320px'
          }}>
            <h2 style={{
              margin: '0 0 24px 0',
              fontSize: '24px',
              fontWeight: 600,
              textAlign: 'center',
              color: '#000'
            }}>
              Choose your color
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px'
            }}>
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.name}
                  onClick={() => handleColorSelect(swatch.name)}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: swatch.hex,
                    border: '2px solid #e0e0e0',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    padding: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  aria-label={swatch.name}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Blind Mode UI - Show only user's own dots */}
      {session && !session.revealed && (
        <div className="fixed inset-0 z-10" style={{ backgroundColor: 'white' }}>
          {myBlindDots.map((dot, i) => (
            <div
              key={dot.clientDotId || `blind-${i}-${dot.createdAt || ''}`}
              style={{
                position: 'absolute',
                left: `${dot.x * 100}%`,
                top: `${dot.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: dot.colorHex,
                border: '1px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.35)',
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
          ))}
        </div>
      )}

      {/* Reveal UI - Full screen off-white div with all dots */}
      {session && session.revealed && (
        <div className="fixed inset-0 z-10" style={{ backgroundColor: '#fafafa' }}>
          {/* Hardcoded Debug Dot */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#ff0000',
              border: '2px solid #000',
              zIndex: 9999,
              pointerEvents: 'none'
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(calc(-50% + 25px), -50%)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#000',
              zIndex: 9999,
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            DEBUG DOT
          </div>
          
          {/* All Revealed Dots */}
          {revealedDots.map((dot, i) => (
            <div
              key={`${dot.sessionId || 'unknown'}-${i}-${dot.createdAt || ''}`}
              style={{
                position: 'absolute',
                left: `${dot.x * 100}%`,
                top: `${dot.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: dot.colorHex,
                border: '1px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.35)',
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
          ))}
        </div>
      )}

      {/* Debug Label - Top Left */}
      {session && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 50,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          pointerEvents: 'none'
        }}>
          {!session.revealed ? (
            <>
              <div>Blind dots: {myBlindDots.length}</div>
              <div style={{ marginTop: '4px', fontSize: '10px' }}>
                Dots left: {Math.max(0, 10 - session.blindDotsUsed)}
              </div>
            </>
          ) : (
            <>
              <div>Reveal dots: {revealedDots.length}</div>
              {revealedDots[0] && (
                <div style={{ marginTop: '4px', fontSize: '10px' }}>
                  First: x={revealedDots[0].x.toFixed(3)}, y={revealedDots[0].y.toFixed(3)}, color={revealedDots[0].colorHex}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Top-right Badge */}
      {session && (
        <div style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 50
        }}>
          <button
            onClick={() => setShowBuyPanel(!showBuyPanel)}
            style={{
              backgroundColor: 'white',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: session.colorHex,
              border: '1px solid #e0e0e0',
              flexShrink: 0
            }} />
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#000'
              }}>
                {session.colorHex.toUpperCase()}
              </span>
              {!session.revealed && (
                <span style={{
                  fontSize: '12px',
                  color: '#666'
                }}>
                  Dots left: {remainingDots}
                </span>
              )}
              {session.revealed && (
                <span style={{
                  fontSize: '12px',
                  color: '#666'
                }}>
                  Credits: {session.credits}
                </span>
              )}
            </div>
          </button>

          {/* Buy Panel */}
          {showBuyPanel && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              backgroundColor: 'white',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '16px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              minWidth: '240px',
              zIndex: 51
            }}>
              {session.revealed ? (
                <>
                  <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  color: '#000'
                }}>
                  Buy Credits
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#666',
                  marginBottom: '16px'
                }}>
                  Current: {session.credits} credits
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <button
                    onClick={() => purchaseCredits(STRIPE_PRICES.CREDITS_50)}
                    disabled={isLoadingPurchase}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isLoadingPurchase ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: isLoadingPurchase ? 0.6 : 1
                    }}
                  >
                    50 Credits - $0.50
                  </button>
                  <button
                    onClick={() => purchaseCredits(STRIPE_PRICES.CREDITS_100)}
                    disabled={isLoadingPurchase}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isLoadingPurchase ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: isLoadingPurchase ? 0.6 : 1
                    }}
                  >
                    100 Credits - $1.00
                  </button>
                  <button
                    onClick={() => purchaseCredits(STRIPE_PRICES.CREDITS_500)}
                    disabled={isLoadingPurchase}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isLoadingPurchase ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: isLoadingPurchase ? 0.6 : 1
                    }}
                  >
                    500 Credits - $5.00
                  </button>
                </div>
                </>
              ) : (
                <div style={{
                  fontSize: '14px',
                  color: '#666',
                  textAlign: 'center',
                  padding: '8px'
                }}>
                  Complete 10 dots to unlock purchases
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clickable White Screen - Only in blind mode */}
      {session && !session.revealed && (
        <div
          ref={clickableAreaRef}
          onClick={handleClick}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'white',
            width: '100vw',
            height: '100vh',
            cursor: isPlacing ? 'wait' : 'pointer',
            zIndex: 0
          }}
        />
      )}

      {/* Background - In reveal mode (behind reveal layer) */}
      {session && session.revealed && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#fafafa',
            width: '100vw',
            height: '100vh',
            zIndex: 0
          }}
        />
      )}
    </>
  )
}
