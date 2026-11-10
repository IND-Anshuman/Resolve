import { Storefront } from './storefront';

export const dynamic = 'force-dynamic';

export default function StorePage() {
  // The client id is public by design (it ships to the browser in PayPal's own script tag).
  return (
    <>
      <Storefront clientId={process.env.PAYPAL_CLIENT_ID ?? ''} />
    </>
  );
}
