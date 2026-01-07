import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-server'
import { STRIPE_PRICES } from '@/lib/stripe-prices'

export async function POST(request: NextRequest) {
  // Build baseUrl with explicit scheme (https://)
  let baseUrl: string
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const vercelUrl = process.env.VERCEL_URL

  if (siteUrl && (siteUrl.startsWith('http://') || siteUrl.startsWith('https://'))) {
    baseUrl = siteUrl
  } else if (vercelUrl) {
    baseUrl = `https://${vercelUrl}`
  } else {
    baseUrl = 'http://localhost:3000'
  }

  console.log('baseUrl', baseUrl)
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

    // Validate minimum charge: ensure price is at least $0.50 (Stripe minimum)
    // Fetch price details from Stripe to verify amount
    try {
      const price = await stripe.prices.retrieve(priceId)
      const amount = price.unit_amount || 0
      const amountInDollars = amount / 100 // Convert from cents
      
      if (amountInDollars < 0.50) {
        return NextResponse.json(
          { error: 'Minimum charge is $0.50' },
          { status: 400 }
        )
      }
    } catch (priceError: any) {
      console.error('Error fetching price from Stripe:', priceError)
      // Continue anyway - Stripe will reject if price is invalid
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
        success_url: `${baseUrl}/?success=1`,
        cancel_url: `${baseUrl}/?canceled=1`,
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

