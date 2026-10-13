import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null

export function sanitizeSupabaseErrorText(value, additionalSensitiveValues = []) {
  let safeText = String(value)
  const sensitiveValues = [
    supabaseUrl,
    supabasePublishableKey,
    ...additionalSensitiveValues,
  ].filter(Boolean)

  for (const sensitiveValue of sensitiveValues) {
    safeText = safeText.split(sensitiveValue).join('[redacted]')
  }

  return safeText
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, '[redacted key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]')
}
