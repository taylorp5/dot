// Stripe Price IDs for credit bundles
// These should be created in your Stripe Dashboard
// 
// To create prices:
// 1. Go to Stripe Dashboard > Products
// 2. Create a product (e.g., "Dot Credits - 25 Pack")
// 3. Add a price: $0.25, one-time payment
// 4. Copy the Price ID (starts with price_) and paste it below
// 5. Repeat for 100 and 500 credit bundles

export const STRIPE_PRICES = {
  // 25 credits = $0.25
  CREDITS_25: process.env.STRIPE_PRICE_ID_25 || 'price_xxxxxxxxxxxxx',
  
  // 100 credits = $1.00
  CREDITS_100: process.env.STRIPE_PRICE_ID_100 || 'price_xxxxxxxxxxxxx',
  
  // 500 credits = $5.00
  CREDITS_500: process.env.STRIPE_PRICE_ID_500 || 'price_xxxxxxxxxxxxx',
} as const

// Map price IDs to credit amounts
export const PRICE_TO_CREDITS: Record<string, number> = {
  [STRIPE_PRICES.CREDITS_25]: 25,
  [STRIPE_PRICES.CREDITS_100]: 100,
  [STRIPE_PRICES.CREDITS_500]: 500,
}

