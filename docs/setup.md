# Setup

For the complete environment variable reference and sponsor dashboard walkthrough, see [sponsor-setup.md](sponsor-setup.md).

This gets you from a fresh clone to a real sandbox refund issued by your own code. Budget an afternoon, mostly for waiting on PayPal.

Do step 1 first. Turning on Transaction Search can take hours to apply, and newly created orders take up to 3 hours to show up in it.

## What you need

- Node.js 22 or newer
- A [PayPal Developer](https://developer.paypal.com) account
- A Postgres database. The [Neon](https://neon.tech) free tier is enough.
- An [OpenAI](https://platform.openai.com) API key, or a key for any OpenAI-compatible provider (for the agent, once it's built)
- [ngrok](https://ngrok.com) or [Pinggy](https://pinggy.io), so PayPal can send webhooks to your laptop

## 1. PayPal sandbox

In the PayPal Developer dashboard, under **Testing Tools > Sandbox Accounts**, make sure you have:

- one **Business** account. This is the store, Clay & Kiln.
- two **Personal** accounts. These are the buyers.

Then under **Apps & Credentials** (Sandbox tab):

1. Create a REST app linked to the Business account.
2. Copy the **Client ID** and **Secret**.
3. In the app's features list, turn on **Transaction Search**.

## 2. Tunnel and webhook

Start a tunnel to the port the app runs on:

```bash
ngrok http 3000
```

Copy the `https://...` forwarding URL. In your PayPal app, add a webhook:

- URL: `<forwarding URL>/api/webhooks/paypal`
- Events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`

Copy the **Webhook ID** it shows afterwards.

The free ngrok URL changes every time you restart it. When that happens, update the webhook URL in PayPal too (the webhook ID stays the same).

## 3. Test card

The seed script pays for orders with a sandbox card so it doesn't need a buyer to click through checkout. In the dashboard, open **Testing Tools > Card Generator**, generate a Visa, and note the number and expiry.

## 4. Environment

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | Step 1 |
| `PAYPAL_ENV` | Leave as `sandbox` |
| `PAYPAL_WEBHOOK_ID` | Step 2 |
| `PAYPAL_TEST_CARD_NUMBER`, `PAYPAL_TEST_CARD_EXPIRY` | Step 3. Expiry is `YYYY-MM` |
| `DATABASE_URL` | Your Neon connection string |
| `OPENAI_API_KEY` | OpenAI platform, or your compatible provider |
| `OPENAI_BASE_URL` | Optional. Set for a compatible provider (OpenRouter, Azure, Ollama, vLLM). Defaults to OpenAI |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-4o`. Needs tool calling |
| `OPENAI_VISION` | Optional. Set to `false` for a text-only model. Photos are then not sent to the model, so damage claims go to the seller with weak evidence |
| `DEMO_ORDER_ID`, `DEMO_ORDER_EMAIL` | Optional. Printed by `npm run seed:scenarios`, step 8 |

`.env.local` is ignored by git. Don't commit it.

## 5. Install and migrate

```bash
npm run setup
```

This runs `npm install` and then applies the migrations in `drizzle/` to your database, creating all ten tables.

## 6. Seed orders

```bash
npm run seed:orders -- 40
```

Each order is created and captured in the sandbox, then saved to the `orders` table. You'll see a line per order with its PayPal order id and capture id.

All seeded orders are timestamped "now", since PayPal doesn't let you backdate payments. Run this a few days before you need a realistic order history.

## 7. First real refund

Start the app and keep the tunnel running:

```bash
npm run dev
```

In another terminal, pick an order id from the seed output and refund $15 of it:

```bash
npm run refund -- <paypal-order-id> 15
```

Leave off the amount for a full refund. You should see `ok: true` and a refund id. Within a few seconds PayPal sends `PAYMENT.CAPTURE.REFUNDED` to your webhook, and a row shows up in `webhook_events` with `verified = true`. The refund request and PayPal's response are in the `actions` table.

Run the same command again and it returns the same refund with `replayed: true` instead of refunding twice.

## 8. The demo scenarios

```bash
npm run seed:scenarios
```

This places one real sandbox order for each demo case: a damaged mug set, a damaged vase, a lost parcel, a parcel still in transit, a wrong item, a change of mind, a repeat refunder and a prompt-injection attempt. It prints a cheat sheet with each order number, the email to use, and what to type in the chat. It also prints two `DEMO_*` lines for `.env.local` that switch on the "Use the demo order" button.

The repeat refunder gets two earlier refunds written straight into the database. Those are history rows only, and no PayPal refund was made for them.

## 9. Try it

With `npm run dev` and your tunnel running, open <http://localhost:3000>.

- **Buyer chat** at `/help`: enter an order number and email from the cheat sheet and describe the problem. Attach a photo for the damage cases.
- **Seller console** at `/console`: watch the case appear, open it to see the decision math, and approve anything that needs it.
- **Store** at `/store`: place a fresh order with a sandbox buyer account, then use "Get help with this order".

Optionally, measure the agent:

```bash
npm run benchmark
```

This needs only the OpenAI key.

## Troubleshooting

**The seed script fails on the first order.** Your sandbox Business account may not be set up to process cards directly. Place about ten orders by hand through the storefront instead through the store at `/store`, logging in with the sandbox buyer accounts. Ten real orders is plenty for a demo.

**Webhook rows have `verified = false`.** Check that `PAYPAL_WEBHOOK_ID` matches the webhook you created, and that the event came from the same app. You can send test events from the dashboard's webhook simulator, but simulator events fail verification by design, so use a real refund to check.

**No webhook arrives at all.** The tunnel URL probably changed. Update it in the PayPal app's webhook settings.

**The chat says "The assistant is unavailable".** The model call failed. Check `OPENAI_API_KEY`, `OPENAI_BASE_URL` and the server log.

**The console shows a setup message instead of cases.** The database isn't reachable. Check `DATABASE_URL` and that `npm run db:migrate` has run.

**Transaction Search returns nothing.** Give it time. The permission can take hours to apply, and new transactions can take up to 3 hours to appear. Nothing that runs during a live complaint depends on it.
