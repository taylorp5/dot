import Stripe from 'stripe'

// Use placeholder during build to prevent build failures
// Actual value must be set in production environment via Vercel env vars
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_PLACEHOLDER_DO_NOT_USE_IN_PRODUCTION'

// Server-side Stripe client
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
})
