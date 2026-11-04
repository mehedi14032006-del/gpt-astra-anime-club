import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    const maxBytes = 1024 * 1024; // 1MB payload guard
    req.on('data', (c) => {
      totalBytes += c.length;
      if (totalBytes > maxBytes) {
        reject(new Error('Webhook payload too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey || !webhookSecret) {
    return res.status(503).json({
      error: 'Webhook handler is not configured (missing Stripe or Supabase service credentials).'
    });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  const stripe = new Stripe(stripeSecretKey);
  let event;
  try {
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    console.error('[Stripe Webhook Signature Error]', e?.message || e);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  const sb = createClient(supabaseUrl, supabaseServiceKey);
  let claimed = false;

  try {
    // Idempotency: record the event id first. A repeat delivery hits the primary key and is skipped.
    const claim = await sb.from('stripe_events').insert({ event_id: event.id, type: event.type });
    if (claim.error) {
      if (claim.error.code === '23505') {
        return res.status(200).json({ received: true, duplicate: true, eventId: event.id });
      }
      throw claim.error;
    }
    claimed = true;

    const obj = event.data?.object || {};

    if (event.type === 'checkout.session.completed') {
      const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
      if (obj.client_reference_id && paid) {
        const upd = await sb
          .from('profiles')
          .update({
            subscription_tier: 'premium',
            stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : null
          })
          .eq('id', obj.client_reference_id)
          .select('id');
        if (upd.error) throw upd.error;
        if (!upd.data || upd.data.length === 0) throw new Error('No profile matched checkout session');

        const audit = await sb.from('admin_audit_logs').insert({
          action_type: 'STRIPE_SUBSCRIPTION_ACTIVATED',
          target_entity: `profile:${obj.client_reference_id}`,
          details: { event_id: event.id, customer: obj.customer }
        });
        if (audit.error) console.error('[Audit log insert failed]', audit.error.message);
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      // Premium only while Stripe says the subscription is active or trialing.
      // past_due, unpaid, canceled and expired all return the user to free.
      const active =
        event.type === 'customer.subscription.updated' &&
        ['active', 'trialing'].includes(String(obj.status || ''));

      if (obj.customer) {
        const upd = await sb
          .from('profiles')
          .update({ subscription_tier: active ? 'premium' : 'free' })
          .eq('stripe_customer_id', String(obj.customer));
        if (upd.error) throw upd.error;
      }
    }

    return res.status(200).json({ received: true, eventId: event.id });
  } catch (e) {
    console.error('[Stripe Webhook Fulfillment Error]', e?.message || e);
    // Release the claim so Stripe's automatic retry can process this event again.
    if (claimed) {
      await sb.from('stripe_events').delete().eq('event_id', event.id);
    }
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
