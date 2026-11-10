// Creates and captures real sandbox orders so the demo store has history in PayPal (and in
// Transaction Search, which lags by up to 3 hours: run this days before the demo).
//
//   npm run seed:orders -- 40
//
// Orders are paid server-side with a sandbox test card from PAYPAL_TEST_CARD_*. If your
// sandbox business account cannot process cards, place ~10 orders by hand through the
// storefront with the sandbox buyer logins instead.

import { CATALOG } from '../lib/store/catalog';
import type { ShipmentStatus } from '../lib/carrier/simulated';
import { line, placeOrder } from './lib/place-order';

const count = Number(process.argv[2] ?? 40);

// Most orders arrive fine; a few are still moving or lost, as in real life.
const pickShipment = (): ShipmentStatus => {
  const r = Math.random();
  return r < 0.75 ? 'delivered' : r < 0.9 ? 'in_transit' : 'lost';
};

async function main() {
  const inStock = CATALOG.filter((p) => p.inStock);
  for (let n = 1; n <= count; n++) {
    const sku = inStock[Math.floor(Math.random() * inStock.length)].sku;
    const placed = await placeOrder({ items: [line(sku)], email: `seed-buyer-${n}@demo.test`, shipment: pickShipment(), cardName: `Seed Buyer ${n}` });
    console.log(`${n}/${count}  ${placed.orderId}  $${placed.amount}  ${placed.trackingNumber}`);
  }
  console.log(`Seeded ${count} orders.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
