# Dot App - Next.js with Supabase & Stripe

Deployed on Vercel 🚀

A collaborative dot canvas application where users can place dots, reveal the canvas, and purchase credits for additional placements.

## Features

- **Anonymous Sessions**: Users choose a color name and get assigned a unique hex color
- **Blind Phase**: Place up to 10 free dots without seeing others' dots
- **Reveal**: After 10 dots, reveal the canvas to see all dots
- **Credit System**: Purchase credits to place additional dots after reveal
- **Stripe Payments**: Secure payment processing for credit bundles

## Setup

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Stripe account

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional: Stripe Price IDs (or set in lib/stripe-prices.ts)
NEXT_PUBLIC_STRIPE_PRICE_ID_50=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_ID_100=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_ID_500=price_xxxxxxxxxxxxx
```

3. Run the Supabase migration:

   - Go to your Supabase Dashboard
   - Navigate to SQL Editor
   - Run the contents of `supabase/migrations/001_initial_schema.sql`

4. Set up Stripe Products and Prices:

   - Go to Stripe Dashboard > Products
   - Create 3 products with the following prices:
     - **50 Credits**: $0.50 (one-time payment, minimum Stripe charge)
     - **100 Credits**: $1.00 (one-time payment)
     - **500 Credits**: $5.00 (one-time payment)
   - Copy each Price ID (starts with `price_`)
   - Update `lib/stripe-prices.ts` with your Price IDs, or set them as environment variables (use `NEXT_PUBLIC_` prefix)

5. Set up Stripe Webhook:

   - Go to Stripe Dashboard > Developers > Webhooks
   - Add endpoint: `https://your-domain.com/api/stripe/webhook`
   - Select event: `checkout.session.completed`
   - Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env.local`

6. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Local Webhook Testing with Stripe CLI

To test webhooks locally during development, use the Stripe CLI:

### Installation

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli

2. Login to Stripe CLI:

```bash
stripe login
```

### Forward Webhooks to Local Server

1. Start your Next.js development server:

```bash
npm run dev
```

2. In a separate terminal, forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

This will output a webhook signing secret that looks like:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

3. Update your `.env.local` with this webhook secret:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

4. Restart your Next.js server to pick up the new environment variable.

### Testing Payments

1. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Any future expiry date (e.g., `12/34`)
   - Any 3-digit CVC (e.g., `123`)
   - Any ZIP code (e.g., `12345`)

2. Trigger a test payment:
   - Place 10 dots to reveal the canvas
   - Click a "Buy Credits" button
   - Complete the checkout with a test card
   - The webhook should fire and grant credits to your session

3. Verify webhook events:

```bash
stripe events list
```

Or view in real-time:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook --print-json
```

### Production Webhook Setup

For production:

1. Deploy your app to a public URL (e.g., Vercel, Railway, etc.)
2. In Stripe Dashboard > Developers > Webhooks, add your production webhook endpoint:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`
3. Copy the webhook signing secret to your production environment variables
4. Update `NEXT_PUBLIC_SITE_URL` to your production URL

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── dots/
│   │   │   ├── all/route.ts          # GET all dots (revealed sessions only)
│   │   │   └── place/route.ts        # POST place a dot
│   │   ├── session/
│   │   │   ├── init/route.ts         # POST initialize session
│   │   │   ├── reveal/route.ts       # POST reveal session
│   │   │   └── route.ts               # GET session snapshot
│   │   └── stripe/
│   │       ├── checkout/route.ts     # POST create checkout session
│   │       └── webhook/route.ts       # POST handle webhook events
│   ├── page.tsx                       # Main app component
│   └── ...
├── lib/
│   ├── color-pools.ts                 # Color name to hex pool mapping
│   ├── stripe-prices.ts               # Stripe price ID configuration
│   ├── stripe-server.ts               # Server-side Stripe client
│   └── supabase-server.ts             # Server-side Supabase client
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql     # Database schema
```

## API Routes

### Session Management

- `POST /api/session/init` - Initialize a new session with color name
- `POST /api/session/reveal` - Reveal session after 10 blind dots
- `GET /api/session?sessionId=...` - Get session snapshot

### Dots

- `POST /api/dots/place` - Place a dot (blind or paid)
- `GET /api/dots/all?sessionId=...` - Get all dots (revealed sessions only)

### Stripe

- `POST /api/stripe/checkout` - Create Stripe Checkout session
- `POST /api/stripe/webhook` - Handle Stripe webhook events

## Security Notes

- All Supabase writes use server-side service role key (never exposed to client)
- Stripe secret keys are server-side only
- Webhook signature verification prevents unauthorized requests
- Session data stored in localStorage (client-side only)

## License

MIT

