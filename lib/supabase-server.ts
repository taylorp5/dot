import { createClient } from '@supabase/supabase-js'

// Get env vars, but use valid placeholders if they contain "your_" (local dev placeholders)
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Use valid placeholder URLs during build to prevent build failures
// Actual values must be set in production environment via Vercel env vars
const supabaseUrl = (rawUrl.includes('your_') || !rawUrl) 
  ? 'https://abcdefghijklmnop.supabase.co' 
  : rawUrl

const supabaseServiceRoleKey = (rawKey.includes('your_') || !rawKey)
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  : rawKey

// Server-side Supabase client with service role key
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
