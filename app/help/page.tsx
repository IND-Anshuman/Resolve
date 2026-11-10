import { HelpChat } from './help-chat';

export const dynamic = 'force-dynamic';

export default function HelpPage() {
  // A demo order (sandbox only) lets a judge try the chat without placing an order first.
  const demo =
    process.env.DEMO_ORDER_ID && process.env.DEMO_ORDER_EMAIL
      ? { orderId: process.env.DEMO_ORDER_ID, email: process.env.DEMO_ORDER_EMAIL }
      : null;
  return (
    <>
      <HelpChat demo={demo} />
    </>
  );
}
