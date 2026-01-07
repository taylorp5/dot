import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { ALLOWED_COLORS, getAvailableHex, normalizeHex } from '@/lib/color-pools'
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

    // Canonicalize color name: trim and lowercase
    const canonical = String(colorName).trim().toLowerCase()

    // Validate against ALLOWED_COLORS
    if (!ALLOWED_COLORS.includes(canonical as typeof ALLOWED_COLORS[number])) {
      return NextResponse.json(
        { 
          error: 'Invalid color name',
          allowedColors: ALLOWED_COLORS,
          received: colorName
        },
        { status: 400 }
      )
    }

    // Fetch all used hexes from database and normalize them
    const { data: existingSessions, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('color_hex')

    if (fetchError) {
      console.error('Error fetching existing sessions:', fetchError)
      return NextResponse.json(
        { error: 'Failed to check available colors' },
        { status: 500 }
      )
    }

    // Normalize used hexes before passing to getAvailableHex
    const usedHexes = (existingSessions || [])
      .map(s => normalizeHex(s.color_hex))
      .filter(Boolean)

    // Get available hex using the helper function
    const availableHex = getAvailableHex(canonical, usedHexes)

    if (!availableHex) {
      return NextResponse.json(
        { error: 'That color is full, pick another.' },
        { status: 400 }
      )
    }

    // Attempt to insert session with the available hex
    const sessionId = uuidv4()
    const { data: session, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert({
        session_id: sessionId,
        color_name: canonical, // Store canonical lowercase name
        color_hex: availableHex, // Already normalized
        blind_dots_used: 0,
        revealed: false,
        credits: 0
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a unique constraint violation
      const errorCode = insertError.code
      const errorMessage = insertError.message || ''
      
      const isUniqueViolation = 
        errorCode === '23505' || 
        errorCode === 'PGRST116' ||
        errorMessage.toLowerCase().includes('unique') ||
        errorMessage.toLowerCase().includes('duplicate') ||
        errorMessage.includes('color_hex')

      if (isUniqueViolation) {
        // Race condition: hex was taken between our check and insert
        // Retry with updated used hexes
        const { data: updatedSessions } = await supabaseAdmin
          .from('sessions')
          .select('color_hex')
        
        const updatedUsedHexes = (updatedSessions || [])
          .map(s => normalizeHex(s.color_hex))
          .filter(Boolean)
        
        const retryHex = getAvailableHex(canonical, updatedUsedHexes)
        
        if (!retryHex) {
          return NextResponse.json(
            { error: 'That color is full, pick another.' },
            { status: 400 }
          )
        }

        // Retry insert with new hex
        const { data: retrySession, error: retryError } = await supabaseAdmin
          .from('sessions')
          .insert({
            session_id: uuidv4(),
            color_name: canonical,
            color_hex: retryHex,
            blind_dots_used: 0,
            revealed: false,
            credits: 0
          })
          .select()
          .single()

        if (retryError || !retrySession) {
          console.error('Error creating session on retry:', retryError)
          return NextResponse.json(
            { error: 'Failed to create session', details: retryError?.message },
            { status: 500 }
          )
        }

        return NextResponse.json({
          sessionId: retrySession.session_id,
          colorName: retrySession.color_name,
          colorHex: retrySession.color_hex,
          blindDotsUsed: retrySession.blind_dots_used,
          revealed: retrySession.revealed,
          credits: retrySession.credits
        })
      } else {
        // Some other error occurred
        console.error('Error creating session (non-unique):', insertError)
        return NextResponse.json(
          { error: 'Failed to create session', details: insertError.message },
          { status: 500 }
        )
      }
    }

    // Insert succeeded!
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
