// Milestone 1: a real sandbox refund triggered by our own code, through the executor.
//
//   npm run refund -- <paypal-order-id> [amount-in-dollars]
//
// Omit the amount for a full refund. Then watch PAYMENT.CAPTURE.REFUNDED arrive at the
// webhook and land in webhook_events.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { toCents } from '../lib/money';
import { executeRefund } from '../lib/paypal/executor';

async function main() {
  const [orderId, dollars] = process.argv.slice(2);
  if (!orderId) throw new Error('Usage: npm run refund -- <paypal-order-id> [amount-in-dollars]');
  const amountCents = dollars ? toCents(dollars) : 'full';

  const result = await executeRefund({
    requestId: `script-${orderId}-${amountCents}`,
    caseId: null,
    paypalOrderId: orderId,
    amountCents,
    // A person running this script is the approval.
    guardrail: 'needs_approval',
    approvedBy: 'script:first-refund',
  });
  console.log(result);
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
