import { z } from 'zod';
import { errorResponse, json, parseBody } from '@/lib/api';
import { createOrder } from '@/lib/paypal/orders';
import { productBySku } from '@/lib/store/catalog';

const body = z.object({
  items: z.array(z.object({ sku: z.string(), quantity: z.number().int().min(1).max(10) })).min(1).max(20),
});

// Prices come from the catalog here, never from the browser, so the amount cannot be edited.
export async function POST(request: Request) {
  try {
    const { items } = await parseBody(request, body);
    const lines = items.map(({ sku, quantity }) => {
      const product = productBySku(sku);
      if (!product || !product.inStock) throw new Error(`Unavailable item ${sku}`);
      return { sku, name: product.name, quantity, unitCents: product.priceCents };
    });
    const order = await createOrder(lines);
    return json({ id: order.id });
  } catch (err) {
    return errorResponse(err);
  }
}
