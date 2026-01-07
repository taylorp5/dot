import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { normalizeHex } from '@/lib/color-pools'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    // Fetch dots where session_id matches
    const { data: dots, error: dotsError } = await supabaseAdmin
      .from('dots')
      .select('x, y, color_hex, phase, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (dotsError) {
      console.error('Error fetching dots:', dotsError)
      return NextResponse.json(
        { error: 'Failed to fetch dots' },
        { status: 500 }
      )
    }

    // Map to camelCase DTO
    const dotDTOs = (dots || []).map((dot) => ({
      x: dot.x,
      y: dot.y,
      colorHex: normalizeHex(dot.color_hex),
      phase: dot.phase,
      createdAt: dot.created_at
    }))

    return NextResponse.json(dotDTOs)
  } catch (error) {
    console.error('Error in dots mine:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

