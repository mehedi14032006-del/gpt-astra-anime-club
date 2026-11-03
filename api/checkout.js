import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sign in first' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = 'https://' + req.headers.host;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID || 'price_1UXoypJWtJ2l9AIx6jvE85a0', quantity: 1 }],
      client_reference_id: data.user.id,
      customer_email: data.user.email,
      success_url: origin + '/?checkout=success',
      cancel_url: origin + '/#premium'
    });
    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not start checkout' });
  }
}
