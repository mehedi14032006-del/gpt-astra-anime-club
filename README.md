# Kitsune+

Anime streaming site: static front end (`index.html`) plus Vercel functions (`api/`).

## Environment variables (set in Vercel, never commit)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` (optional, defaults to the test price)

## Stripe webhook
Endpoint: `https://YOUR-DOMAIN/api/webhook`
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
