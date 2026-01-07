import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getAvailableHex, normalizeHex } from '@/lib/color-pools'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const { colorName } = await request.json()

    if (!colorName || typeof colorName !== 'string') {
      return NextResponse.json(
        { error: 'colorName is required' },
        { status: 400 }
      )
    }

    // Get all currently used hexes
    const { data: existingSessions, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('color_hex')

    if (fetchError) {
      console.error('Error fetching existing sessions:', fetchError)
      return NextResponse.json(
        { error: 'Failed to check existing sessions' },
        { status: 500 }
      )
    }

    const usedHexes = (existingSessions || []).map(s => s.color_hex)
    const availableHex = getAvailableHex(colorName, usedHexes)

    if (!availableHex) {
      return NextResponse.json(
        { error: 'That color is full, pick another.' },
        { status: 400 }
      )
    }

    const sessionId = uuidv4()

    // Create session
    const { data: session, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert({
        session_id: sessionId,
        color_name: colorName,
        color_hex: normalizeHex(availableHex),
        blind_dots_used: 0,
        revealed: false,
        credits: 0
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating session:', insertError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sessionId: session.session_id,
      colorName: session.color_name,
      colorHex: session.color_hex,
      blindDotsUsed: session.blind_dots_used,
      revealed: session.revealed,
      credits: session.credits
    })
  } catch (error) {
    console.error('Error in session init:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

