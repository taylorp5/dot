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

    console.log('[webhook] session.id', session.id)

    // Determine sessionId in priority order: client_reference_id first, then metadata
    const sessionId = session.client_reference_id || session.metadata?.sessionId

    if (!sessionId) {
      console.error('[webhook] Missing sessionId in webhook event')
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      )
    }

    console.log('[webhook] sessionId', sessionId)

    // Fetch the purchased priceId from Stripe line items instead of metadata
    let priceId: string | null = null
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
      priceId = lineItems.data[0]?.price?.id || null
    } catch (lineItemsError) {
      console.error('[webhook] Error fetching line items:', lineItemsError)
      return NextResponse.json(
        { error: 'Failed to fetch line items' },
        { status: 500 }
      )
    }

    if (!priceId) {
      console.error('[webhook] Missing priceId in line items')
      return NextResponse.json(
        { error: 'Missing priceId' },
        { status: 400 }
      )
    }

    console.log('[webhook] priceId', priceId)

    // Map creditsToGrant from PRICE_TO_CREDITS
    const creditsToGrant = PRICE_TO_CREDITS[priceId]

    if (!creditsToGrant) {
      console.error(`[webhook] Unknown priceId: ${priceId}`)
      console.error(`[webhook] Available priceIds:`, Object.keys(PRICE_TO_CREDITS))
      return NextResponse.json(
        { error: 'Unknown priceId' },
        { status: 400 }
      )
    }

    console.log('[webhook] creditsToGrant', creditsToGrant)

    // Fetch current session to verify it exists and log current credits
    const { data: currentSession, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('credits')
      .eq('session_id', sessionId)
      .single()

    if (fetchError || !currentSession) {
      console.error('[webhook] Error fetching session:', fetchError)
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    console.log('[webhook] Current credits before update:', currentSession.credits)

    // Use RPC function for atomic credit increment (avoids race conditions)
    const { data: newCredits, error: rpcError } = await supabaseAdmin
      .rpc('increment_credits', {
        p_session_id: sessionId,
        p_amount: creditsToGrant
      })

    if (rpcError) {
      console.error('[webhook] Error calling increment_credits RPC:', rpcError)
      // Fallback to select+update if RPC fails
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          credits: currentSession.credits + creditsToGrant
        })
        .eq('session_id', sessionId)
        .select('credits')
        .single()

      if (updateError) {
        console.error('[webhook] Error updating session credits (fallback):', updateError)
        return NextResponse.json(
          { error: 'Failed to update credits' },
          { status: 500 }
        )
      }

      console.log('[webhook] Credits after update (fallback):', updatedSession?.credits)
    } else {
      console.log('[webhook] Credits after update (RPC):', newCredits)
    }

    console.log(`[webhook] Granted ${creditsToGrant} credits to session ${sessionId}`)
  }

  return NextResponse.json({ received: true })
}

