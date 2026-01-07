import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY!

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

// Server-side Stripe client
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-11-20.acacia',
})

