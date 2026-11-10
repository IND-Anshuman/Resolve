# Resolve environment and sponsor setup

This guide takes a fresh checkout to a working PayPal sandbox demo, then enables the optional sponsor integrations. Copy `.env.example` to `.env.local`; never commit `.env.local` or paste secret values into Postman collections.

## 1. Install and create the local environment

Requirements: Node.js 22+, npm, and a Postgres database. Neon is the simplest local database for this project.

```bash
npm install
copy .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Use `http://localhost:3000` for `APP_URL` locally.

## 2. Environment variable reference

### Required for the core demo

| Variable | Example | Where to get it | Purpose |
| --- | --- | --- | --- |
| `PAYPAL_CLIENT_ID` | `A...` | PayPal Developer Dashboard → **Apps & Credentials** → Sandbox → REST app | Server and browser PayPal client |
| `PAYPAL_SECRET` | `E...` | Same REST app; keep server-only | OAuth and PayPal API calls |
| `PAYPAL_ENV` | `sandbox` | Set manually; use `live` only for a real store | Selects PayPal API host |
| `PAYPAL_WEBHOOK_ID` | `2F...` | PayPal Developer Dashboard → **Webhooks** after creating the webhook | Verifies incoming PayPal events |
| `DATABASE_URL` | `postgresql://...` | Neon → project → **Connect** → pooled connection string | Drizzle/Postgres data store |
| `OPENAI_API_KEY` | `sk-...` | OpenAI Platform → **API keys**, or your OpenAI-compatible provider | Buyer chat agent |

The app makes no live PayPal or model call until these values are present. `PAYPAL_SECRET` and `OPENAI_API_KEY` must not use a `NEXT_PUBLIC_` prefix.

### PayPal optional/demo variables

| Variable | Example | Purpose |
| --- | --- | --- |
| `PAYPAL_TEST_CARD_NUMBER` | `4111111111111111` | Seed script sandbox card |
| `PAYPAL_TEST_CARD_EXPIRY` | `2028-12` | Seed script sandbox card expiry |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` | Alternate OpenAI-compatible API endpoint |
| `OPENAI_MODEL` | `gpt-4o` | Model with tool calling and image input |
| `DEMO_ORDER_ID` | `5O...` | Enables the demo-order shortcut in `/help` |
| `DEMO_ORDER_EMAIL` | `buyer@example.com` | Email paired with `DEMO_ORDER_ID` |

### Resolve operations/security variables

| Variable | Recommended value | Purpose |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` locally; Render HTTPS URL in production | Absolute approval links sent to Zapier |
| `CRON_SECRET` | 32+ random characters | Bearer secret for `/api/cron/recheck` |
| `CONSOLE_ACCESS_TOKEN` | 32+ random characters | Optional seller-console login; leave blank for an open local demo |
| `APPROVAL_EXPIRY_HOURS` | `48` | Hours before a waiting approval expires; invalid values safely fall back to 48 |

Generate local values in PowerShell:

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

When `CONSOLE_ACCESS_TOKEN` is set, open `/console` and enter it in the sign-in screen. The browser receives an HttpOnly session cookie; the token is not sent to the client bundle.

### Sponsor variables

| Variable | Sponsor | What to enter |
| --- | --- | --- |
| `ZAPIER_WEBHOOK_URL` | Zapier | The URL from a **Webhooks by Zapier → Catch Hook** trigger |
| `ELASTIC_URL` | Elastic | The deployment URL, without the index name, for example `https://my-deployment.es.us-east4.gcp.elastic.cloud` |
| `ELASTIC_API_KEY` | Elastic | An API key with read/write/create-index access to the Resolve index |
| `ELASTIC_INDEX` | Elastic | Usually `resolve`; lowercase letters, numbers, `_`, `-` only |

All sponsor variables are optional. Missing or failing Zapier/Elastic calls are logged and ignored; they never block a chat response or PayPal refund.

## 3. PayPal Developer setup

1. Open [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/), choose **Sandbox**, and create one Business account plus a Personal buyer account under **Testing Tools → Sandbox Accounts**.
2. Go to **Apps & Credentials → Sandbox → Create App**. Create a REST app for the Business account and copy its Client ID and Secret into `.env.local`.
3. Enable **Transaction Search** for the app if you want the optional PayPal history work later. Resolve's current guardrail history uses its own audited case data.
4. Expose the local app to PayPal:

   ```bash
   ngrok http 3000
   ```

5. In the PayPal app, go to **Webhooks → Add Webhook** and set:
   `https://YOUR-TUNNEL.ngrok.app/api/webhooks/paypal`
6. Subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, and `CUSTOMER.DISPUTE.RESOLVED`. Put the resulting Webhook ID in `PAYPAL_WEBHOOK_ID`.
7. If using the seed scripts, open **Testing Tools → Card Generator**, copy a sandbox card number and expiry, and set the two `PAYPAL_TEST_CARD_*` variables.

PayPal webhook verification uses the raw request bytes and the Webhook ID. Do not proxy, pretty-print, or reserialize webhook bodies before they reach the app.

## 4. OpenAI setup

Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys), set `OPENAI_API_KEY`, and use `OPENAI_MODEL=gpt-4o` unless your provider documents another vision/tool-calling model. For OpenRouter, Azure, Ollama, or vLLM, set `OPENAI_BASE_URL` to that provider's OpenAI-compatible `/v1` endpoint.

## 5. Zapier setup

1. Create a Zapier account and choose **Create Zap**.
2. Select **Webhooks by Zapier → Catch Hook** as the trigger and copy the generated URL to `ZAPIER_WEBHOOK_URL`.
3. Trigger a Resolve case that needs approval. The payload contains `event`, `caseId`, `amountCents`, `reason`, `approval_url`, and `console_url`.
4. Add a Slack, Gmail, or Email by Zapier action. Use `approval_url` as the link in the notification.
5. If one Zap handles all events, add a Filter step for `event` values `case.needs_approval`, `refund.issued`, and `dispute.opened`.

Zapier delivery is best-effort and is not part of the refund transaction. A failed Zap is visible in server logs and does not cause a refund retry.

## 6. Elastic setup

1. Create a deployment at [cloud.elastic.co](https://cloud.elastic.co/).
2. Copy the deployment's Elasticsearch endpoint into `ELASTIC_URL`. Do not append `/resolve`; the adapter appends `ELASTIC_INDEX`.
3. Create an API key with access to the index. A minimal policy for the default `resolve` index needs `read`, `write`, `create_index`, and `view_index_metadata` privileges.
4. Set `ELASTIC_API_KEY` and `ELASTIC_INDEX=resolve`.
5. Start the app and run a complaint. Resolve creates the index mapping, indexes policy lines and stores assessed cases.

The agent's read-only `find_similar_cases` tool uses complaint text and complaint type. Live PayPal facts and local policy remain authoritative. If Elastic is unavailable, the tool returns no matches and the local policy is still used.

## 7. Render deployment and cron

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, select the repository, and apply `render.yaml`.
3. The blueprint creates a web service, a Postgres database, and a 15-minute cron service. Fill the `sync: false` values in the web service: PayPal, OpenAI, `APP_URL`, Zapier, and Elastic values.
4. After the web service receives its stable HTTPS URL, set `APP_URL` to that URL and update the PayPal webhook URL to:
   `https://YOUR-RENDER-DOMAIN.onrender.com/api/webhooks/paypal`
5. Nothing to copy: the cron service reads `CRON_SECRET` and `APP_URL` from the web service through `fromService`. Render's health check uses the public `/api/health` route.
6. Set `CONSOLE_ACCESS_TOKEN` on the web service. Open `/console` and sign in with it.
7. Deploy and verify:

   ```bash
   curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-RENDER-DOMAIN.onrender.com/api/cron/recheck
   ```

The web build runs `npm run db:migrate` before `npm run build`. Migration `0001_black_microchip.sql` removes duplicate legacy shipment rows before enforcing one shipment per order.

## 8. Postman and sponsor demos

Import:

- `postman/Resolve.postman_collection.json`
- `postman/Resolve.postman_environment.json`

Set `DEMO_ORDER_ID`, `DEMO_ORDER_EMAIL`, and `CRON_SECRET`. Run the folders in order: buyer chat, console cases/approval, timeline, cron, then webhook. For a no-credentials rehearsal, create a Postman mock server from the collection and change `baseUrl` to the mock URL.

## 9. APIMatic and Bryntum

- APIMatic: import `specs/paypal-disputes.openapi.yaml` into the APIMatic dashboard, select a TypeScript client, and generate a client for comparison or replacement. The repository's `lib/paypal/disputes.ts` already exposes the typed `get`, `provideEvidence`, and `acceptClaim` boundary using the same spec paths, so no new environment variable is required.
- Bryntum: the current `/console` Timeline tab is dependency-free and uses `/api/console/timeline`, avoiding a license key during the hackathon demo. If a Bryntum Scheduler license is available, the returned timeline items are the adapter input; no secret belongs in browser-visible environment variables.

## 10. First end-to-end run

```bash
npm run seed:orders -- 3
npm run seed:scenarios
npm run dev
```

Open `/help` with a seeded order, submit a complaint, then open `/console`. Confirm that:

1. the case appears in **Cases**;
2. over-limit decisions appear in **Approvals**;
3. the **Results** chart shows automatic refund spend and cap;
4. **Timeline** shows the approval or shipment milestone;
5. a successful PayPal refund creates a `refund.issued` Zapier event when configured;
6. `/api/cron/recheck` returns shipment and approval counts.
