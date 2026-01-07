import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, x, y } = await request.json()

    if (!sessionId || typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { error: 'sessionId, x, and y are required' },
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
          { error: 'No free dots left — reveal to continue.' },
          { status: 400 }
        )
      }

      // Insert blind dot
      const { error: dotError } = await supabaseAdmin
        .from('dots')
        .insert({
          id: uuidv4(),
          session_id: sessionId,
          x,
          y,
          color_hex: session.color_hex,
          phase: 'blind'
        })

      if (dotError) {
        console.error('Error inserting dot:', dotError)
        return NextResponse.json(
          { error: 'Failed to place dot' },
          { status: 500 }
        )
      }

      // Increment blind_dots_used
      const newBlindDotsUsed = session.blind_dots_used + 1

      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          blind_dots_used: newBlindDotsUsed
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
    } else {
      // Revealed phase - requires credits
      if (session.credits <= 0) {
        return NextResponse.json(
          { error: 'Insufficient credits' },
          { status: 400 }
        )
      }

      // Insert paid dot
      const { error: dotError } = await supabaseAdmin
        .from('dots')
        .insert({
          id: uuidv4(),
          session_id: sessionId,
          x,
          y,
          color_hex: session.color_hex,
          phase: 'paid'
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

