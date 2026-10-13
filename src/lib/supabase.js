import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

console.info('[Supabase] Configuration status:', {
  VITE_SUPABASE_URL: supabaseUrl ? 'present' : 'missing',
  VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey ? 'present' : 'missing',
})

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null

export function getSupabaseErrorMessage(error) {
  const message = error instanceof Error
    ? error.message
    : error?.message || 'An unexpected error occurred.'
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('networkerror')
    || normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('load failed')
  ) {
    return 'Could not reach Supabase. Verify the configured project URL and matching publishable key, then check the browser Network tab for connection or DNS errors.'
  }

  return sanitizeSupabaseErrorText(message)
}

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
    .replace(
      /(^|[^A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{7,}(?:\.[A-Za-z0-9_-]+){0,2}(?:=+)?)(?=$|[^A-Za-z0-9_-])/gi,
      (_, leadingCharacter) => `${leadingCharacter ?? ''}[redacted token]`,
    )
}
