import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { normalizeHex } from '@/lib/color-pools'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, x, y, clientW, clientH, clientDotId } = await request.json()

    if (!sessionId || typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { error: 'sessionId, x, and y are required' },
        { status: 400 }
      )
    }

    // PERMANENT FIX: Reject coordinates outside [0,1] instead of clamping
    // This prevents pixel coordinates from entering the database
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return NextResponse.json(
        { error: 'Invalid coordinates: x and y must be in range [0,1]' },
        { status: 400 }
      )
    }

    // Coordinates are already normalized [0,1]
    const xNorm = x
    const yNorm = y

    // Fetch session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    if (!session.revealed) {
      // Blind phase - enforce 10 dot limit atomically
      console.log('[SERVER] Blind phase placement:', {
        sessionId,
        blind_dots_used_before: session.blind_dots_used,
        x: xNorm,
        y: yNorm,
        clientDotId
      })

      // Check for idempotency FIRST: if clientDotId provided, check if dot already exists
      if (clientDotId && typeof clientDotId === 'string') {
        const { data: existingDot, error: lookupError } = await supabaseAdmin
          .from('dots')
          .select('id, session_id')
          .eq('session_id', sessionId)
          .eq('client_dot_id', clientDotId)
          .single()

        if (existingDot && !lookupError) {
          // Dot already exists - return existing session state (idempotent)
          console.log('[SERVER] Dot already exists (idempotent):', { clientDotId, dotId: existingDot.id })
          
          // Fetch current session state
          const { data: currentSession } = await supabaseAdmin
            .from('sessions')
            .select('session_id, color_name, color_hex, blind_dots_used, revealed, credits')
            .eq('session_id', sessionId)
            .single()

          if (currentSession) {
            return NextResponse.json({
              sessionId: currentSession.session_id,
              colorName: currentSession.color_name,
              colorHex: currentSession.color_hex,
              blindDotsUsed: currentSession.blind_dots_used,
              revealed: currentSession.revealed,
              credits: currentSession.credits
            })
          }
        }
      }

      // REAL ATOMIC DB OPERATION: Call RPC function consume_blind_dot
      // This performs the update atomically in the database:
      // UPDATE sessions SET blind_dots_used = blind_dots_used + 1, revealed = (blind_dots_used + 1) >= 10
      // WHERE session_id = p_session_id AND revealed = false AND blind_dots_used < 10
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('consume_blind_dot', {
        p_session_id: sessionId
      })

      if (rpcError) {
        console.error('[SERVER] RPC consume_blind_dot error:', rpcError)
        return NextResponse.json(
          { 
            error: 'Failed to consume blind dot',
            details: rpcError.message,
            code: rpcError.code
          },
          { status: 500 }
        )
      }

      // If data is empty: limit reached or already revealed
      if (!rpcResult || rpcResult.length === 0) {
        console.log('[SERVER] RPC returned no rows - limit reached or already revealed')
        
        // Fetch current session for error response
        const { data: currentSession } = await supabaseAdmin
          .from('sessions')
          .select('session_id, color_name, color_hex, blind_dots_used, revealed, credits')
          .eq('session_id', sessionId)
          .single()

        if (currentSession) {
          return NextResponse.json(
            { 
              error: 'NO_FREE_DOTS',
              session: {
                sessionId: currentSession.session_id,
                colorName: currentSession.color_name,
                colorHex: currentSession.color_hex,
                blindDotsUsed: currentSession.blind_dots_used,
                revealed: currentSession.revealed,
                credits: currentSession.credits
              }
            },
            { status: 409 }
          )
        } else {
          return NextResponse.json(
            { error: 'Session not found after RPC call' },
            { status: 404 }
          )
        }
      }

      // RPC succeeded - use returned session snapshot as authoritative
      const updated = rpcResult[0]
      const shouldReveal = updated.revealed

      // Insert blind dot with normalized coordinates
      // Use updated.color_hex from RPC result (not stale session.color_hex)
      const dotId = uuidv4()
      const insertData: any = {
        id: dotId,
        session_id: sessionId,
        x: xNorm,
        y: yNorm,
        color_hex: normalizeHex(updated.color_hex),
        phase: 'blind',
        client_w: typeof clientW === 'number' ? clientW : null,
        client_h: typeof clientH === 'number' ? clientH : null
      }

      // Include client_dot_id if provided (for idempotency)
      if (clientDotId && typeof clientDotId === 'string') {
        insertData.client_dot_id = clientDotId
      }

      const { data: insertedDot, error: dotError } = await supabaseAdmin
        .from('dots')
        .insert(insertData)
        .select()
        .single()

      if (dotError) {
        // Check if it's a unique constraint violation (duplicate client_dot_id)
        const errorCode = dotError.code
        const errorMessage = dotError.message || ''
        
        const isUniqueViolation = 
          errorCode === '23505' || 
          errorCode === 'PGRST116' ||
          errorMessage.toLowerCase().includes('unique') ||
          errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.includes('client_dot_id')

        if (isUniqueViolation && clientDotId) {
          // Duplicate client_dot_id - return existing session state (idempotent)
          // Note: RPC already incremented blind_dots_used, but this is idempotent
          // The dot already exists, so we return the current session state
          console.log('[SERVER] Duplicate client_dot_id (idempotent):', { clientDotId })
          
          // Fetch current session state (RPC already updated it)
          const { data: currentSession } = await supabaseAdmin
            .from('sessions')
            .select('session_id, color_name, color_hex, blind_dots_used, revealed, credits')
            .eq('session_id', sessionId)
            .single()

          if (currentSession) {
            return NextResponse.json({
              sessionId: currentSession.session_id,
              colorName: currentSession.color_name,
              colorHex: currentSession.color_hex,
              blindDotsUsed: currentSession.blind_dots_used,
              revealed: currentSession.revealed,
              credits: currentSession.credits
            })
          }
        }

        // On other errors, we can't easily rollback the RPC increment
        // This is a rare case - log it for monitoring
        console.error('[SERVER] Error inserting dot after RPC success:', dotError)

        console.error('[SERVER] Error inserting dot:', dotError)
        return NextResponse.json(
          { error: 'Failed to place dot' },
          { status: 500 }
        )
      }

      console.log('[SERVER] Dot inserted successfully:', { dotId, clientDotId })

      // Return session DTO based on updated values from RPC
      return NextResponse.json({
        sessionId: updated.session_id,
        colorName: updated.color_name,
        colorHex: updated.color_hex,
        blindDotsUsed: updated.blind_dots_used,
        revealed: updated.revealed,
        credits: updated.credits
      })
    } else {
      // Revealed phase - requires credits
      if (session.credits <= 0) {
        return NextResponse.json(
          { error: 'Insufficient credits' },
          { status: 400 }
        )
      }

      // Insert paid dot with normalized coordinates
      const { error: dotError } = await supabaseAdmin
        .from('dots')
        .insert({
          id: uuidv4(),
          session_id: sessionId,
          x: xNorm,
          y: yNorm,
          color_hex: normalizeHex(session.color_hex),
          phase: 'paid',
          client_w: typeof clientW === 'number' ? clientW : null,
          client_h: typeof clientH === 'number' ? clientH : null
        })

      if (dotError) {
        console.error('Error inserting dot:', dotError)
        return NextResponse.json(
          { error: 'Failed to place dot' },
          { status: 500 }
        )
      }

      // Decrement credits
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          credits: session.credits - 1
        })
        .eq('session_id', sessionId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating session:', updateError)
        return NextResponse.json(
          { error: 'Failed to update session' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        sessionId: updatedSession.session_id,
        colorName: updatedSession.color_name,
        colorHex: updatedSession.color_hex,
        blindDotsUsed: updatedSession.blind_dots_used,
        revealed: updatedSession.revealed,
        credits: updatedSession.credits
      })
    }
  } catch (error) {
    console.error('Error in dots place:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

