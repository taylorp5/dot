import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-server'
import { STRIPE_PRICES } from '@/lib/stripe-prices'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, priceId } = await request.json()

    if (!sessionId || !priceId) {
      console.error('Missing required fields:', { sessionId: !!sessionId, priceId: !!priceId })
      return NextResponse.json(
        { error: 'sessionId and priceId are required' },
        { status: 400 }
      )
    }

    // Validate priceId is one of our configured prices
    const validPriceIds = Object.values(STRIPE_PRICES)
    if (!validPriceIds.includes(priceId)) {
      console.error('Invalid priceId:', { 
        received: priceId, 
        valid: validPriceIds,
        configured: STRIPE_PRICES
      })
      return NextResponse.json(
        { 
          error: 'Invalid priceId',
          received: priceId,
          validPriceIds: validPriceIds
        },
        { status: 400 }
      )
    }

    // Create Stripe Checkout Session
    let checkoutSession
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${siteUrl}/?success=1`,
        cancel_url: `${siteUrl}/?canceled=1`,
        client_reference_id: sessionId,
        metadata: {
          sessionId: sessionId,
          priceId: priceId,
        },
      })
    } catch (stripeError: any) {
      console.error('Stripe API error:', stripeError)
      return NextResponse.json(
        { 
          error: 'Stripe API error',
          message: stripeError.message,
          type: stripeError.type
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

