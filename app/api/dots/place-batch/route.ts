import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { normalizeHex } from '@/lib/color-pools'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, dots } = await request.json()

    if (!sessionId || !Array.isArray(dots) || dots.length === 0) {
      return NextResponse.json(
        { error: 'sessionId and dots array are required' },
        { status: 400 }
      )
    }

    // Validate dots
    for (const dot of dots) {
      if (typeof dot.x !== 'number' || typeof dot.y !== 'number' || !dot.clientDotId) {
        return NextResponse.json(
          { error: 'Each dot must have x, y (numbers) and clientDotId (string)' },
          { status: 400 }
        )
      }
      // Validate normalized coordinates
      if (dot.x < 0 || dot.x > 1 || dot.y < 0 || dot.y > 1) {
        return NextResponse.json(
          { error: 'Coordinates must be in range [0,1]' },
          { status: 400 }
        )
      }
    }

    // Add loud server logs (temporary)
    console.log('[place-batch] sessionId', sessionId, 'dots', dots.length)

    // FIRST: Fetch session row - enforce DB-backed sessions
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('session_id, revealed, blind_dots_used, credits, color_hex')
      .eq('session_id', sessionId)
      .single()

    console.log('[place-batch] found session?', !!session)

    // If error: return 500 JSON with supabase error message/details
    if (sessionError) {
      console.error('[place-batch] Error fetching session:', sessionError)
      return NextResponse.json(
        { 
          error: 'Failed to fetch session',
          details: sessionError.message || String(sessionError),
          code: sessionError.code || 'UNKNOWN'
        },
        { status: 500 }
      )
    }

    // If session missing: return 404 JSON with sessionId
    if (!session) {
      console.error('[place-batch] Session not found:', sessionId)
      return NextResponse.json(
        { error: 'Session not found', sessionId },
        { status: 404 }
      )
    }

    // Ensure NO code path inserts dots without a session
    // At this point, session is guaranteed to exist

    if (!session.revealed) {
      // Blind phase
      const remainingFree = Math.max(0, 10 - session.blind_dots_used)
      const acceptCount = Math.min(remainingFree, dots.length)

      if (acceptCount === 0) {
        // No free dots left - optionally set revealed=true if blind_dots_used >= 10
        const shouldReveal = session.blind_dots_used >= 10
        
        if (shouldReveal) {
          const { data: updatedSession, error: updateError } = await supabaseAdmin
            .from('sessions')
            .update({ revealed: true })
            .eq('session_id', sessionId)
            .select('session_id, revealed, blind_dots_used, credits, color_hex')
            .single()

          if (updateError) {
            console.error('[place-batch] Error updating session to revealed:', updateError)
            return NextResponse.json(
              { 
                error: 'Failed to update session',
                details: updateError.message,
                code: updateError.code
              },
              { status: 500 }
            )
          }

          if (updatedSession) {
            return NextResponse.json(
              {
                error: 'NO_FREE_DOTS',
                session: {
                  sessionId: updatedSession.session_id,
                  blindDotsUsed: updatedSession.blind_dots_used,
                  revealed: updatedSession.revealed,
                  credits: updatedSession.credits,
                  colorHex: updatedSession.color_hex
                },
                accepted: []
              },
              { status: 409 }
            )
          }
        }

        return NextResponse.json(
          {
            error: 'NO_FREE_DOTS',
            session: {
              sessionId: session.session_id,
              blindDotsUsed: session.blind_dots_used,
              revealed: session.revealed,
              credits: session.credits,
              colorHex: session.color_hex
            },
            accepted: []
          },
          { status: 409 }
        )
      }

      // Insert ONLY the first acceptCount dots
      // Use individual inserts with error handling for idempotency
      const dotsToInsert = dots.slice(0, acceptCount).map(dot => ({
        id: uuidv4(),
        session_id: sessionId,
        x: dot.x,
        y: dot.y,
        color_hex: normalizeHex(session.color_hex),
        phase: 'blind' as const,
        client_dot_id: dot.clientDotId
      }))

      // Insert dots, ignoring duplicates (idempotent)
      const insertedDots: any[] = []
      for (const dot of dotsToInsert) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('dots')
          .insert(dot)
          .select()
          .single()

        if (insertError) {
          // Check if it's a unique constraint violation (duplicate client_dot_id)
          const errorCode = insertError.code
          const errorMessage = insertError.message || ''
          
          const isUniqueViolation = 
            errorCode === '23505' || 
            errorCode === 'PGRST116' ||
            errorMessage.toLowerCase().includes('unique') ||
            errorMessage.toLowerCase().includes('duplicate') ||
            errorMessage.includes('client_dot_id')

          if (isUniqueViolation) {
            // Duplicate - fetch existing dot (idempotent)
            const { data: existing } = await supabaseAdmin
              .from('dots')
              .select('*')
              .eq('session_id', sessionId)
              .eq('client_dot_id', dot.client_dot_id)
              .single()
            
            if (existing) {
              insertedDots.push(existing)
            }
          } else {
            console.error('[SERVER] Error inserting dot:', insertError)
          }
        } else if (inserted) {
          insertedDots.push(inserted)
        }
      }

      // Atomically increment blind_dots_used by actual inserted count
      const actualInsertedCount = insertedDots.length
      const newBlindDotsUsed = session.blind_dots_used + actualInsertedCount
      const shouldReveal = newBlindDotsUsed >= 10

      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          blind_dots_used: newBlindDotsUsed,
          revealed: shouldReveal
        })
        .eq('session_id', sessionId)
        .select('session_id, revealed, blind_dots_used, credits, color_hex')
        .single()

      if (updateError) {
        console.error('[SERVER] Error updating session:', updateError)
        return NextResponse.json(
          { error: 'Failed to update session' },
          { status: 500 }
        )
      }

      // Map inserted dots to DTO
      const acceptedDots = (insertedDots || []).map(dot => ({
        sessionId: dot.session_id,
        x: dot.x,
        y: dot.y,
        colorHex: dot.color_hex,
        phase: dot.phase,
        createdAt: dot.created_at,
        clientDotId: dot.client_dot_id
      }))

      // Always return JSON with session DTO
      return NextResponse.json({
        session: {
          sessionId: updatedSession.session_id,
          blindDotsUsed: updatedSession.blind_dots_used,
          revealed: updatedSession.revealed,
          credits: updatedSession.credits,
          colorHex: updatedSession.color_hex
        },
        acceptedDots
      })
    } else {
      // Revealed phase - requires credits
      const acceptCount = Math.min(session.credits, dots.length)

      if (acceptCount === 0) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_CREDITS',
            session: {
              sessionId: session.session_id,
              blindDotsUsed: session.blind_dots_used,
              revealed: session.revealed,
              credits: session.credits,
              colorHex: session.color_hex
            }
          },
          { status: 400 }
        )
      }

      // Insert paid dots
      // Use individual inserts with error handling for idempotency
      const dotsToInsert = dots.slice(0, acceptCount).map(dot => ({
        id: uuidv4(),
        session_id: sessionId,
        x: dot.x,
        y: dot.y,
        color_hex: normalizeHex(session.color_hex),
        phase: 'paid' as const,
        client_dot_id: dot.clientDotId
      }))

      const insertedDots: any[] = []
      for (const dot of dotsToInsert) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('dots')
          .insert(dot)
          .select()
          .single()

        if (insertError) {
          // Check if it's a unique constraint violation (duplicate client_dot_id)
          const errorCode = insertError.code
          const errorMessage = insertError.message || ''
          
          const isUniqueViolation = 
            errorCode === '23505' || 
            errorCode === 'PGRST116' ||
            errorMessage.toLowerCase().includes('unique') ||
            errorMessage.toLowerCase().includes('duplicate') ||
            errorMessage.includes('client_dot_id')

          if (isUniqueViolation) {
            // Duplicate - fetch existing dot (idempotent)
            const { data: existing } = await supabaseAdmin
              .from('dots')
              .select('*')
              .eq('session_id', sessionId)
              .eq('client_dot_id', dot.client_dot_id)
              .single()
            
            if (existing) {
              insertedDots.push(existing)
            }
          } else {
            console.error('[SERVER] Error inserting dot:', insertError)
          }
        } else if (inserted) {
          insertedDots.push(inserted)
        }
      }

      // Atomically decrement credits by actual inserted count
      const actualInsertedCount = insertedDots.length
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          credits: session.credits - actualInsertedCount
        })
        .eq('session_id', sessionId)
        .select('session_id, revealed, blind_dots_used, credits, color_hex')
        .single()

      if (updateError) {
        console.error('[SERVER] Error updating session:', updateError)
        return NextResponse.json(
          { error: 'Failed to update session' },
          { status: 500 }
        )
      }

      const acceptedDots = (insertedDots || []).map(dot => ({
        sessionId: dot.session_id,
        x: dot.x,
        y: dot.y,
        colorHex: dot.color_hex,
        phase: dot.phase,
        createdAt: dot.created_at,
        clientDotId: dot.client_dot_id
      }))

      return NextResponse.json({
        session: {
          sessionId: updatedSession.session_id,
          blindDotsUsed: updatedSession.blind_dots_used,
          revealed: updatedSession.revealed,
          credits: updatedSession.credits,
          colorHex: updatedSession.color_hex
        },
        acceptedDots
      })
    }
  } catch (error) {
    console.error('Error in dots place-batch:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

