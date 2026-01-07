'use client'

import { useReducer, useEffect, useRef, useState } from 'react'
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
  sessionId?: string
  x: number
  y: number
  colorHex: string
  phase: 'blind' | 'paid'
  createdAt?: string
  clientDotId?: string
}

interface AppState {
  session: Session | null
  optimistic: Dot[]
  mineServer: Dot[]
  allServer: Dot[]
  hydratedMine: boolean
}

type AppAction =
  | { type: 'SESSION_SET'; session: Session }
  | { type: 'OPTIMISTIC_ADD'; dot: Dot }
  | { type: 'OPTIMISTIC_REMOVE'; clientDotId: string }
  | { type: 'MINE_SET'; dots: Dot[] }
  | { type: 'ALL_SET'; dots: Dot[] }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SESSION_SET':
      return { ...state, session: action.session }
    
    case 'OPTIMISTIC_ADD':
      return { ...state, optimistic: [...state.optimistic, action.dot] }
    
    case 'OPTIMISTIC_REMOVE':
      return {
        ...state,
        optimistic: state.optimistic.filter(d => d.clientDotId !== action.clientDotId)
      }
    
    case 'MINE_SET':
      // IMPORTANT: merge mineServer with optimistic, don't replace
      // Server dots replace optimistic dots with same clientDotId, but keep other optimistic dots
      const merged = mergeDots([...action.dots, ...state.optimistic])
      return {
        ...state,
        mineServer: action.dots, // Store server dots separately
        optimistic: state.optimistic.filter(opt => 
          !action.dots.find(server => server.clientDotId === opt.clientDotId)
        ), // Remove optimistic dots that are now confirmed by server
        hydratedMine: true
      }
    
    case 'ALL_SET':
      return { ...state, allServer: action.dots }
    
    default:
      return state
  }
}

// Merge function: dedupe by clientDotId when present, otherwise by phase:x:y
function mergeDots(dots: Dot[]): Dot[] {
  const seen = new Map<string, Dot>()
  
  for (const dot of dots) {
    let key: string
    
    if (dot.clientDotId) {
      key = `client-${dot.clientDotId}`
    } else {
      const roundedX = Math.round(dot.x * 10000)
      const roundedY = Math.round(dot.y * 10000)
      key = `${dot.phase}:${roundedX}:${roundedY}`
    }
    
    // Prefer dots with createdAt (server dots) over optimistic dots
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, dot)
    } else if (dot.createdAt && !existing.createdAt) {
      seen.set(key, dot)
    } else if (!dot.createdAt && existing.createdAt) {
      // Keep existing server dot
    }
  }
  
  return Array.from(seen.values())
}

const initialState: AppState = {
  session: null,
  optimistic: [],
  mineServer: [],
  allServer: [],
  hydratedMine: false
}

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showBuyPanel, setShowBuyPanel] = useState(false)
  const [isPlacing, setIsPlacing] = useState(false)
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false)
  const clickableAreaRef = useRef<HTMLDivElement>(null)
  const hydratedMineRef = useRef(false) // Guard to prevent multiple hydrations

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
          colorName: '',
          colorHex: data.colorHex,
          blindDotsUsed: data.blindDotsUsed,
          revealed: data.revealed,
          credits: data.credits
        }
        
        dispatch({ type: 'SESSION_SET', session: hydratedSession })
        
        // Fetch user's own dots ONCE per sessionId
        if (!hydratedMineRef.current) {
          fetch(`/api/dots/mine?sessionId=${sessionId}`, { cache: 'no-store' })
            .then(async (res) => {
              if (res.ok) {
                const serverDots: Dot[] = await res.json()
                dispatch({ type: 'MINE_SET', dots: serverDots })
                hydratedMineRef.current = true
              }
            })
            .catch(console.error)
        }
        
        // If revealed, fetch all dots
        if (hydratedSession.revealed) {
          fetch(`/api/dots/all?sessionId=${sessionId}`, { cache: 'no-store' })
            .then(async (res) => {
              if (res.ok) {
                const allDots: Dot[] = await res.json()
                dispatch({ type: 'ALL_SET', dots: allDots })
              }
            })
            .catch(console.error)
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
    if (state.session?.revealed && state.allServer.length === 0) {
      // Fetch all dots exactly once when revealed
      fetch(`/api/dots/all?sessionId=${state.session.sessionId}`, { cache: 'no-store' })
        .then(async (res) => {
          if (res.ok) {
            const allDots: Dot[] = await res.json()
            dispatch({ type: 'ALL_SET', dots: allDots })
          }
        })
        .catch(console.error)
    }
  }, [state.session?.revealed])

  // Handle Stripe success redirect
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    
    if (success === '1' && state.session) {
      fetch(`/api/session/get?sessionId=${state.session.sessionId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json()
            dispatch({
              type: 'SESSION_SET',
              session: {
                sessionId: data.sessionId,
                colorName: state.session!.colorName,
                colorHex: data.colorHex,
                blindDotsUsed: data.blindDotsUsed,
                revealed: data.revealed,
                credits: data.credits
              }
            })
          }
        })
        .catch(console.error)
      
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [state.session])

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
        colorName: colorName,
        colorHex: data.colorHex,
        blindDotsUsed: data.blindDotsUsed,
        revealed: data.revealed,
        credits: data.credits
      }

      dispatch({ type: 'SESSION_SET', session: newSession })
      dispatch({ type: 'MINE_SET', dots: [] }) // Clear mine dots for new session
      dispatch({ type: 'ALL_SET', dots: [] }) // Clear all dots for new session
      hydratedMineRef.current = false // Reset hydration guard
      localStorage.setItem('justadot_session_id', newSession.sessionId)
      setShowColorPicker(false)
    } catch (error) {
      console.error('Error initializing session:', error)
      alert('Failed to initialize session')
    }
  }

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state.session || !clickableAreaRef.current || isPlacing) {
      return
    }

    // Only allow clicks in blind mode (not revealed)
    if (state.session.revealed) {
      return
    }

    // Prevent placement if no dots remaining
    const remainingDots = Math.max(0, 10 - state.session.blindDotsUsed)
    if (remainingDots <= 0) {
      return
    }

    // Get normalized coordinates from getBoundingClientRect()
    const rect = clickableAreaRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    // Clamp to [0,1]
    const xNorm = Math.max(0, Math.min(1, x))
    const yNorm = Math.max(0, Math.min(1, y))

    // Generate client dot ID
    const clientDotId = crypto.randomUUID()

    // Immediately add optimistic dot
    const optimisticDot: Dot = {
      x: xNorm,
      y: yNorm,
      colorHex: state.session.colorHex,
      phase: 'blind',
      clientDotId: clientDotId
    }
    dispatch({ type: 'OPTIMISTIC_ADD', dot: optimisticDot })

    setIsPlacing(true)

    try {
      const response = await fetch('/api/dots/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.session.sessionId,
          x: xNorm,
          y: yNorm,
          clientDotId: clientDotId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Remove optimistic dot on failure
        dispatch({ type: 'OPTIMISTIC_REMOVE', clientDotId })
        
        if (response.status === 409 && data.error === 'NO_FREE_DOTS') {
          if (data.session) {
            dispatch({ type: 'SESSION_SET', session: {
              sessionId: data.session.sessionId,
              colorName: state.session.colorName,
              colorHex: data.session.colorHex,
              blindDotsUsed: data.session.blindDotsUsed,
              revealed: data.session.revealed,
              credits: data.session.credits
            }})
            localStorage.setItem('justadot_session_id', data.session.sessionId)
          }
        } else {
          alert(data.error || 'Failed to place dot')
        }
        setIsPlacing(false)
        return
      }

      // On success: dispatch SESSION_SET(response.session) ONLY
      if (data.session) {
        dispatch({ type: 'SESSION_SET', session: {
          sessionId: data.session.sessionId,
          colorName: state.session.colorName,
          colorHex: data.session.colorHex,
          blindDotsUsed: data.session.blindDotsUsed,
          revealed: data.session.revealed,
          credits: data.session.credits
        }})
        localStorage.setItem('justadot_session_id', data.session.sessionId)

        // If revealed, fetch all dots exactly once
        if (data.session.revealed && !state.session.revealed) {
          fetch(`/api/dots/all?sessionId=${data.session.sessionId}`, { cache: 'no-store' })
            .then(async (res) => {
              if (res.ok) {
                const allDots: Dot[] = await res.json()
                dispatch({ type: 'ALL_SET', dots: allDots })
              }
            })
            .catch(console.error)
        }
      }

      setIsPlacing(false)
    } catch (error) {
      // Remove optimistic dot on error
      dispatch({ type: 'OPTIMISTIC_REMOVE', clientDotId })
      console.error('Error placing dot:', error)
      alert('Failed to place dot')
      setIsPlacing(false)
    }
  }

  const purchaseCredits = async (priceId: string) => {
    if (!state.session || isLoadingPurchase) return

    setIsLoadingPurchase(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.session.sessionId,
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

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      alert('Failed to create checkout session')
      setIsLoadingPurchase(false)
    }
  }

  // Rendering logic
  const isRevealed = state.session?.revealed === true
  const renderDots = isRevealed
    ? state.allServer
    : mergeDots([...state.mineServer, ...state.optimistic])

  const remainingDots = state.session ? Math.max(0, 10 - state.session.blindDotsUsed) : 0

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
      {state.session && !isRevealed && (
        <div className="fixed inset-0 z-10" style={{ backgroundColor: 'white' }}>
          {renderDots.map((dot, i) => (
            <div
              key={dot.clientDotId || `my-${i}-${dot.createdAt || ''}`}
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
      {state.session && isRevealed && (
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
          {renderDots.map((dot, i) => (
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
      {state.session && (
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
          {!isRevealed ? (
            <>
              <div>My dots: {renderDots.length}</div>
              <div style={{ marginTop: '4px', fontSize: '10px' }}>
                Dots left: {remainingDots}
              </div>
            </>
          ) : (
            <>
              <div>All dots: {renderDots.length}</div>
              {renderDots[0] && (
                <div style={{ marginTop: '4px', fontSize: '10px' }}>
                  First: x={renderDots[0].x.toFixed(3)}, y={renderDots[0].y.toFixed(3)}, color={renderDots[0].colorHex}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Top-right Badge */}
      {state.session && (
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
              backgroundColor: state.session.colorHex,
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
                {state.session.colorHex.toUpperCase()}
              </span>
              {!isRevealed && (
                <span style={{
                  fontSize: '12px',
                  color: '#666'
                }}>
                  Dots left: {remainingDots}
                </span>
              )}
              {isRevealed && (
                <span style={{
                  fontSize: '12px',
                  color: '#666'
                }}>
                  Credits: {state.session.credits}
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
              {isRevealed ? (
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
                  Current: {state.session.credits} credits
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
      {state.session && !isRevealed && (
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
      {state.session && isRevealed && (
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
