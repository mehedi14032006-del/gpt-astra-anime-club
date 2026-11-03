import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send('Bad signature');
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed' && obj.client_reference_id) {
    await sb.from('profiles')
      .update({ subscription_tier: 'premium', stripe_customer_id: obj.customer })
      .eq('id', obj.client_reference_id);
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const active = event.type === 'customer.subscription.updated' && ['active', 'trialing'].includes(obj.status);
    await sb.from('profiles')
      .update({ subscription_tier: active ? 'premium' : 'free' })
      .eq('stripe_customer_id', obj.customer);
  }
  res.status(200).json({ received: true });
}
