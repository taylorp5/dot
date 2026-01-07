import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { COLOR_POOLS, normalizeHex } from '@/lib/color-pools'
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

    // 1. Normalize colorName via trim()
    const normalizedColorName = colorName.trim()

    // Get the full hex pool for this color name
    const hexPool = COLOR_POOLS[normalizedColorName]
    if (!hexPool || hexPool.length === 0) {
      return NextResponse.json(
        { error: 'Invalid color name' },
        { status: 400 }
      )
    }

    // Normalize all hex values in the pool
    const normalizedPool = hexPool.map(normalizeHex).filter(Boolean)

    if (normalizedPool.length === 0) {
      return NextResponse.json(
        { error: 'Color pool is empty' },
        { status: 400 }
      )
    }

    // 2. Iterate through candidates and attempt insert with retry on unique constraint violations
    const sessionId = uuidv4()
    let lastError: any = null

    for (const candidateHex of normalizedPool) {
      try {
        // Attempt to insert session with this hex
        const { data: session, error: insertError } = await supabaseAdmin
          .from('sessions')
          .insert({
            session_id: sessionId,
            color_name: normalizedColorName,
            color_hex: candidateHex, // Already normalized
            blind_dots_used: 0,
            revealed: false,
            credits: 0
          })
          .select()
          .single()

        if (insertError) {
          // Check if it's a unique constraint violation (Postgres error code 23505)
          // Supabase/PostgREST returns error codes in different formats
          const errorCode = insertError.code
          const errorMessage = insertError.message || ''
          
          // Check for unique constraint violation
          // Postgres code 23505, or Supabase might return it as '23505' or 'PGRST116'
          // Also check if message contains 'unique' or 'duplicate'
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
          colorName: session.color_name,
          colorHex: session.color_hex,
          blindDotsUsed: session.blind_dots_used,
          revealed: session.revealed,
          credits: session.credits
        })
      } catch (error: any) {
        // Catch any unexpected errors during insert attempt
        const errorMessage = error?.message || String(error)
        const errorCode = error?.code

        // Check for unique constraint violation
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

    // All candidates exhausted
    console.error('All hex candidates exhausted for color:', normalizedColorName)
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
