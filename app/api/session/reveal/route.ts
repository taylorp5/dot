import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
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

    // Only reveal if blind_dots_used >= 10
    if (session.blind_dots_used < 10) {
      return NextResponse.json(
        { error: 'Must place 10 blind dots before revealing' },
        { status: 400 }
      )
    }

    // Update session to revealed
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ revealed: true })
      .eq('session_id', sessionId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating session:', updateError)
      return NextResponse.json(
        { error: 'Failed to reveal session' },
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
  } catch (error) {
    console.error('Error in session reveal:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



