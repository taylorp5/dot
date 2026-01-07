// Stripe Price IDs for credit bundles
// These should be created in your Stripe Dashboard
// 
// To create prices:
// 1. Go to Stripe Dashboard > Products
// 2. Create a product (e.g., "Dot Credits - 50 Pack")
// 3. Add a price: $0.50, one-time payment (minimum Stripe charge)
// 4. Copy the Price ID (starts with price_) and paste it below
// 5. Repeat for 100 and 500 credit bundles

// Note: These must use NEXT_PUBLIC_ prefix to be accessible in client components
// Set these in Vercel environment variables:
// - NEXT_PUBLIC_STRIPE_PRICE_ID_50
// - NEXT_PUBLIC_STRIPE_PRICE_ID_100
// - NEXT_PUBLIC_STRIPE_PRICE_ID_500
export const STRIPE_PRICES = {
  // 50 credits = $0.50 (minimum Stripe charge)
  CREDITS_50: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_50 || 'price_xxxxxxxxxxxxx',
  
  // 100 credits = $1.00
  CREDITS_100: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_100 || 'price_1Smz1oAdMCorYy8cG9yElTiy',
  
  // 500 credits = $5.00
  CREDITS_500: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_500 || 'price_1Smz1yAdMCorYy8ce9wACrLH',
} as const

// Map price IDs to credit amounts
export const PRICE_TO_CREDITS: Record<string, number> = {
  [STRIPE_PRICES.CREDITS_50]: 50,
  [STRIPE_PRICES.CREDITS_100]: 100,
  [STRIPE_PRICES.CREDITS_500]: 500,
}

