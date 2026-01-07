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

    // Validate against allowed colors
    if (!ALLOWED_COLORS.includes(canonical as any)) {
      return NextResponse.json(
        { 
          error: `Invalid color name. Allowed colors: ${ALLOWED_COLORS.join(', ')}`,
          received: colorName,
          canonical: canonical
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
      .map(row => normalizeHex(row.color_hex))
      .filter(Boolean)

    // Get available hex using the helper function
    const availableHex = getAvailableHex(canonical, usedHexes)

    if (!availableHex) {
      return NextResponse.json(
        { error: 'That color is full, pick another.' },
        { status: 400 }
      )
    }

    // Attempt to insert session with retry logic (in case of race condition)
    const sessionId = uuidv4()
    let lastError: any = null
    const maxRetries = 10 // Try up to 10 different hexes if race conditions occur

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Re-fetch used hexes on each attempt (in case another request took a hex)
      const { data: currentSessions } = await supabaseAdmin
        .from('sessions')
        .select('color_hex')

      const currentUsedHexes = (currentSessions || [])
        .map(row => normalizeHex(row.color_hex))
        .filter(Boolean)

      // Get a fresh available hex
      const candidateHex = getAvailableHex(canonical, currentUsedHexes)
      
      if (!candidateHex) {
        return NextResponse.json(
          { error: 'That color is full, pick another.' },
          { status: 400 }
        )
      }

      try {
        // Attempt to insert session with this hex
        const { data: session, error: insertError } = await supabaseAdmin
          .from('sessions')
          .insert({
            session_id: sessionId,
            color_name: canonical, // Store canonical lowercase name
            color_hex: candidateHex, // Already normalized
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
            // This hex is taken, try next one
            lastError = insertError
            continue
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
          colorName: session.color_name, // Return canonical name (can be converted to Title Case in frontend if needed)
          colorHex: session.color_hex,
          blindDotsUsed: session.blind_dots_used,
          revealed: session.revealed,
          credits: session.credits
        })
      } catch (error: any) {
        // Catch any unexpected errors during insert attempt
        const errorMessage = error?.message || String(error)
        const errorCode = error?.code

        const isUniqueViolation = 
          errorCode === '23505' ||
          errorCode === 'PGRST116' ||
          errorMessage.toLowerCase().includes('unique') ||
          errorMessage.toLowerCase().includes('duplicate')

        if (isUniqueViolation) {
          lastError = error
          continue
        } else {
          console.error('Unexpected error during session creation:', error)
          return NextResponse.json(
            { error: 'Failed to create session', details: errorMessage },
            { status: 500 }
          )
        }
      }
    }

    // All retries exhausted
    console.error('All hex candidates exhausted for color:', canonical)
    return NextResponse.json(
      { error: 'That color is full, pick another.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in session init:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
