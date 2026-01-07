import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

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

    // Fetch session to check if revealed
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('revealed')
      .eq('session_id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Only return dots if session is revealed
    if (!session.revealed) {
      return NextResponse.json(
        { error: 'Session must be revealed to fetch all dots' },
        { status: 403 }
      )
    }

    // Fetch all dots
    const { data: dots, error: dotsError } = await supabaseAdmin
      .from('dots')
      .select('x, y, color_hex, phase, created_at')
      .order('created_at', { ascending: true })

    if (dotsError) {
      console.error('Error fetching dots:', dotsError)
      return NextResponse.json(
        { error: 'Failed to fetch dots' },
        { status: 500 }
      )
    }

    return NextResponse.json(dots || [])
  } catch (error) {
    console.error('Error in dots all:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

