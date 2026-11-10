# PayPal integration

Everything Resolve does with PayPal runs against the real sandbox. Nothing is mocked except carrier delivery status, which PayPal doesn't provide.

## Clients

[`lib/paypal/client.ts`](../lib/paypal/client.ts) sets up two ways of talking to PayPal:

- **The official server SDK** (`@paypal/paypal-server-sdk`) for Orders, Payments and Transaction Search. It handles OAuth tokens and gives typed requests and responses.
- **`paypalFetch`**, a small `fetch` wrapper, for the endpoints the SDK doesn't cover: Disputes and webhook signature verification. It caches the access token and refreshes it a minute before it expires.

Both read `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` from the environment and only run on the server. `PAYPAL_ENV=live` switches both to production. Everything else uses the sandbox.

## Endpoints

| Purpose | Endpoint | Where | Status |
| --- | --- | --- | --- |
| Create an order | `POST /v2/checkout/orders` | `orders.ts` `createOrder`, called from `app/api/store/orders` | Built |
| Capture payment | `POST /v2/checkout/orders/{id}/capture` | `orders.ts` `captureOrder`, called from `app/api/store/capture` | Built |
| Read an order live | `GET /v2/checkout/orders/{id}` | `orders.ts` `getLiveOrder` | Built |
| Add tracking | `POST /v2/checkout/orders/{id}/track` | `orders.ts` `addTracking` | Built |
| Refund | `POST /v2/payments/captures/{id}/refund` | `executor.ts` | Built |
| Verify a webhook | `POST /v1/notifications/verify-webhook-signature` | `webhooks.ts` | Built |
| Buyer history | `GET /v1/reporting/transactions` | | Not built. Refund history comes from this app's own cases |
| Disputes | `GET /v1/customer/disputes/{id}`, `/provide-evidence`, `/accept-claim`, `/make-offer`, `/send-message` | | Not built. A dispute webhook updates the case, but nothing is sent back to PayPal yet |

## Things that will bite you

**Refunds need the capture id, not the order id.** An order is the checkout; the capture is the actual payment. `getLiveOrder` returns both. The `orders` table stores both too.

**Read the order from PayPal before moving money.** The `orders` table is a convenience copy. `getLiveOrder` adds up the order's completed and pending refunds (cancelled and failed ones don't count) to get what's still refundable, and the executor always uses that live number.

**Always send a `PayPal-Request-Id` with refunds.** PayPal uses it to recognise a retried request. Resolve builds it from the case id and decision version (`<case-id>-v<version>`), so retrying the same decision is safe while a revised decision gets a new id. The refund script uses `script-<order-id>-<amount>` instead.

**Orders with a `payment_source` also need a `PayPal-Request-Id`.** The seed script passes a test card as the payment source, so `createOrder` always sends one.

**Webhook verification needs the raw body.** PayPal checks the signature against the exact bytes it sent. If you parse the JSON and stringify it again, the bytes change and verification fails. [`webhooks.ts`](../lib/paypal/webhooks.ts) splices the raw body text into the verification request unchanged.

**Webhooks can arrive twice.** The `webhook_events` table is unique on PayPal's event id, so a repeat delivery is ignored. Unverified events are stored for debugging but never acted on, and a later verified delivery of the same id replaces an unverified one.

**Transaction Search is slow.** The permission can take hours to turn on, and new transactions take up to 3 hours to appear. Resolve uses it only for buyer history (has this person had refunds before?), never for the order in the current complaint.

**Tracking doesn't mean delivery status.** PayPal stores a tracking number on the order but won't tell you whether the parcel arrived. Resolve will use a simulated carrier for that, clearly labelled as simulated in the UI.

**Sandbox disputes can't be opened by the seller.** You have to log in to the sandbox site as a buyer and open one on a real order. PayPal's sandbox has extra endpoints to push a dispute through its stages (`require-evidence`, `adjudicate`). Allow a few days.

## Webhook events

Subscribe the app's webhook to:

| Event | Meaning for Resolve |
| --- | --- |
| `PAYMENT.CAPTURE.COMPLETED` | An order was paid |
| `PAYMENT.CAPTURE.REFUNDED` | A refund went through. Confirms the executor's call |
| `CUSTOMER.DISPUTE.CREATED` | The buyer disputed anyway. The case becomes a dispute |
| `CUSTOMER.DISPUTE.UPDATED` | Dispute status changed |
| `CUSTOMER.DISPUTE.RESOLVED` | Dispute closed |

The webhook route verifies and stores every event. Dispute events also create or update a `disputes` row and mark the matching open case as `became_dispute`. The other events are recorded only, since the executor already logged the refund when it made the call.

## References

- [Orders v2 API](https://developer.paypal.com/docs/api/orders/v2/)
- [Payments v2 API (refunds)](https://developer.paypal.com/docs/api/payments/v2/)
- [Disputes API](https://developer.paypal.com/docs/api/customer-disputes/v1/)
- [Webhooks](https://developer.paypal.com/api/rest/webhooks/)
- [Transaction Search](https://developer.paypal.com/docs/api/transaction-search/v1/)
