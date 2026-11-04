import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

/**
 * Validates and resolves a safe origin URL for Stripe redirect callbacks,
 * preventing Host-header injection and open-redirect vulnerabilities.
 */
function resolveSafeOrigin(req) {
  const configuredOrigin = process.env.APP_URL || process.env.VITE_APP_URL;
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Fallback to host header validation
    }
  }

  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000')
    .split(',')[0]
    .trim();
  const safeHostPattern = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;
  if (!safeHostPattern.test(rawHost)) {
    return 'http://localhost:3000';
  }
  const proto = rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${rawHost}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
    return res.status(503).json({
      error:
        'Subscription checkout is not configured on this server (missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY). Premium status is never activated without a verified Stripe checkout session.'
    });
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with your account first.' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer access token.' });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired authentication session. Please sign in again.' });
    }

    const stripe = new Stripe(stripeSecretKey);
    const origin = resolveSafeOrigin(req);
    const priceId = process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      return res.status(503).json({
        error: 'STRIPE_PRICE_ID is not configured on this server.'
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: data.user.id,
      customer_email: data.user.email,
      metadata: {
        supabase_user_id: data.user.id
      },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[Stripe Checkout Error]', e?.message || e);
    return res.status(500).json({ error: 'Could not initialize Stripe checkout session.' });
  }
}
