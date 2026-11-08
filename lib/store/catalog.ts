// Clay & Kiln, the fictional demo store: 12 ceramic products from $18 to $120. Fragile goods
// make "it arrived broken" believable. `costCents` is the seller's cost to send it again.

export type Product = {
  sku: string;
  name: string;
  priceCents: number;
  costCents: number;
  inStock: boolean;
};

export const STORE_NAME = 'Clay & Kiln';
export const SHIPPING_COST_CENTS = 800;

export const CATALOG: Product[] = [
  { sku: 'CK-ESP-2', name: 'Espresso cups, pair', priceCents: 1800, costCents: 600, inStock: true },
  { sku: 'CK-BWL-S', name: 'Small speckled bowl', priceCents: 2200, costCents: 700, inStock: true },
  { sku: 'CK-PLT-S', name: 'Side plate', priceCents: 2400, costCents: 800, inStock: true },
  { sku: 'CK-VAS-B', name: 'Bud vase', priceCents: 2800, costCents: 900, inStock: true },
  { sku: 'CK-SPN-R', name: 'Spoon rest', priceCents: 3200, costCents: 1000, inStock: true },
  { sku: 'CK-PLN-M', name: 'Medium planter', priceCents: 3800, costCents: 1300, inStock: true },
  { sku: 'CK-TPT-S', name: 'Teapot, two-cup', priceCents: 4800, costCents: 1700, inStock: false },
  { sku: 'CK-MUG-4', name: 'Ceramic mug set of four', priceCents: 6000, costCents: 1800, inStock: true },
  { sku: 'CK-PCH-L', name: 'Large pitcher', priceCents: 6800, costCents: 2400, inStock: true },
  { sku: 'CK-SRV-B', name: 'Serving bowl', priceCents: 7400, costCents: 2600, inStock: true },
  { sku: 'CK-DIN-4', name: 'Dinner plates, set of four', priceCents: 9000, costCents: 3500, inStock: false },
  { sku: 'CK-VAS-F', name: 'Floor vase', priceCents: 12000, costCents: 4500, inStock: true },
];

export const productBySku = (sku: string) => CATALOG.find((p) => p.sku === sku);
