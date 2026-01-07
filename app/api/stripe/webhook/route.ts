import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { PRICE_TO_CREDITS } from '@/lib/stripe-prices'
import Stripe from 'stripe'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

if (!webhookSecret) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable')
}

// Disable body parsing for webhook route
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // Get sessionId from metadata or client_reference_id
    const sessionId = session.metadata?.sessionId || session.client_reference_id
    
    // Get priceId from metadata (we store it there in checkout route)
    const priceId = session.metadata?.priceId

    if (!sessionId || !priceId) {
      console.error('Missing sessionId or priceId in webhook event')
      return NextResponse.json(
        { error: 'Missing required data' },
        { status: 400 }
      )
    }

    // Determine credits to grant based on priceId
    const creditsToGrant = PRICE_TO_CREDITS[priceId]

    if (!creditsToGrant) {
      console.error(`Unknown priceId: ${priceId}`)
      return NextResponse.json(
        { error: 'Unknown priceId' },
        { status: 400 }
      )
    }

    // Fetch current session to get current credits
    const { data: currentSession, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('credits')
      .eq('session_id', sessionId)
      .single()

    if (fetchError || !currentSession) {
      console.error('Error fetching session:', fetchError)
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Update session credits
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        credits: currentSession.credits + creditsToGrant
      })
      .eq('session_id', sessionId)

    if (updateError) {
      console.error('Error updating session credits:', updateError)
      return NextResponse.json(
        { error: 'Failed to update credits' },
        { status: 500 }
      )
    }

    console.log(`Granted ${creditsToGrant} credits to session ${sessionId}`)
  }

  return NextResponse.json({ received: true })
}

