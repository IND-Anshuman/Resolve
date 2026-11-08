// Clay & Kiln's policy. One store's policy is short enough to hand to the agent in pieces, so
// there is no search index: get_policy returns the lines for one topic.

export const POLICY_TOPICS = ['shipping', 'damaged_or_wrong', 'returns', 'refunds'] as const;
export type PolicyTopic = (typeof POLICY_TOPICS)[number];

export const POLICY: Record<PolicyTopic, string[]> = {
  shipping: [
    'Orders ship within 2 business days.',
    'Delivery usually takes 3 to 7 business days. Please allow 10 business days before reporting a missing parcel.',
    'Every order has a tracking number.',
  ],
  damaged_or_wrong: [
    'If an item arrives damaged or is not what you ordered, send a clear photo within 14 days of delivery.',
    'We will make it right with a partial refund (you keep the item), a replacement, or a refund, whichever fits.',
    'Ceramics are packed carefully, so we take every breakage report seriously.',
  ],
  returns: [
    'Unused items can be returned within 30 days of delivery for a refund of the item price.',
    'Return shipping is paid by the buyer unless the item was damaged or wrong.',
    'We do not accept returns after 30 days, or refunds for a change of mind after that window.',
  ],
  refunds: [
    'Refunds go back to the original PayPal payment.',
    'Larger refunds are reviewed by the shop owner before they are issued.',
  ],
};

export const getPolicy = (topic: string): string[] => POLICY[topic as PolicyTopic] ?? [];
