import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { normalizeHex } from '@/lib/color-pools'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, x, y, clientDotId } = await request.json()

    if (!sessionId || typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { error: 'sessionId, x, and y are required' },
        { status: 400 }
      )
    }

    // Validate x, y are numbers in [0,1]
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return NextResponse.json(
        { error: 'Invalid coordinates: x and y must be in range [0,1]' },
        { status: 400 }
      )
    }

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
      // Blind phase
      if (session.blind_dots_used >= 10) {
        return NextResponse.json(
          { 
            error: 'NO_FREE_DOTS',
            session: {
              sessionId: session.session_id,
              colorHex: session.color_hex,
              blindDotsUsed: session.blind_dots_used,
              revealed: session.revealed,
              credits: session.credits
            }
          },
          { status: 409 }
        )
      }

      // Insert dot phase='blind' with session.color_hex
      const dotId = uuidv4()
      const { data: insertedDotData, error: dotError } = await supabaseAdmin
        .from('dots')
        .insert({
          id: dotId,
          session_id: sessionId,
          x: x,
          y: y,
          color_hex: normalizeHex(session.color_hex),
          phase: 'blind',
          client_dot_id: clientDotId || null
        })
        .select()
        .single()

      if (dotError || !insertedDotData) {
        console.error('Error inserting dot:', dotError)
        return NextResponse.json(
          { error: 'Failed to place dot' },
          { status: 500 }
        )
      }

      // Increment blind_dots_used by 1
      const newBlindDotsUsed = session.blind_dots_used + 1
      // If new blind_dots_used >= 10 set revealed=true
      const shouldReveal = newBlindDotsUsed >= 10

      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          blind_dots_used: newBlindDotsUsed,
          revealed: shouldReveal
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

      // Return { session: DTO }
      return NextResponse.json({
        session: {
          sessionId: updatedSession.session_id,
          colorHex: updatedSession.color_hex,
          blindDotsUsed: updatedSession.blind_dots_used,
          revealed: updatedSession.revealed,
          credits: updatedSession.credits
        }
      })
    } else {
      // Revealed phase
      if (session.credits <= 0) {
        return NextResponse.json(
          { 
            error: 'INSUFFICIENT_CREDITS',
            session: {
              sessionId: session.session_id,
              colorHex: session.color_hex,
              blindDotsUsed: session.blind_dots_used,
              revealed: session.revealed,
              credits: session.credits
            }
          },
          { status: 400 }
        )
      }

      // Insert dot phase='paid'
      const paidDotId = uuidv4()
      const { data: insertedPaidDotData, error: dotError } = await supabaseAdmin
        .from('dots')
        .insert({
          id: paidDotId,
          session_id: sessionId,
          x: x,
          y: y,
          color_hex: normalizeHex(session.color_hex),
          phase: 'paid',
          client_dot_id: clientDotId || null
        })
        .select()
        .single()

      if (dotError || !insertedPaidDotData) {
        console.error('Error inserting dot:', dotError)
        return NextResponse.json(
          { error: 'Failed to place dot' },
          { status: 500 }
        )
      }

      // Decrement credits by 1
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

      // Return { session: DTO, insertedDot: dotDTO }
      const insertedDot = {
        sessionId: insertedPaidDotData.session_id,
        x: insertedPaidDotData.x,
        y: insertedPaidDotData.y,
        colorHex: normalizeHex(insertedPaidDotData.color_hex),
        phase: insertedPaidDotData.phase as 'blind' | 'paid',
        createdAt: insertedPaidDotData.created_at,
        clientDotId: insertedPaidDotData.client_dot_id || undefined
      }

      return NextResponse.json({
        session: {
          sessionId: updatedSession.session_id,
          colorHex: updatedSession.color_hex,
          blindDotsUsed: updatedSession.blind_dots_used,
          revealed: updatedSession.revealed,
          credits: updatedSession.credits
        },
        insertedDot: insertedDot
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

