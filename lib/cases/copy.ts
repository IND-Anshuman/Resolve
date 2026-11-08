// Fixed wording for the parts of a conversation where the facts, not the model, should speak.
// The model writes the empathy; this module states what the tracking says and what the policy is.

import type { Assessment } from '../agent/assessment';
import type { ShipmentInfo } from '../carrier/simulated';
import { getPolicy } from '../store/policy';

export function holdMessage(assessment: Assessment, shipment: ShipmentInfo | null): string {
  switch (assessment.complaintType) {
    case 'not_received':
      if (!shipment) return "I can't find tracking for this order yet, so I've asked the shop owner to look into it.";
      if (shipment.status === 'delivered') {
        return `The tracking number ${shipment.trackingNumber} shows: ${shipment.summary}. Please check around the delivery address and with neighbours, and tell me if it still hasn't turned up.`;
      }
      return `The tracking number ${shipment.trackingNumber} shows: ${shipment.summary}. ${getPolicy('shipping')[1]} If it still hasn't arrived after that, message me here and we'll sort it out.`;
    case 'changed_mind':
      return `About returns: ${getPolicy('returns').join(' ')}`;
    default:
      return 'The shop owner will have a look at this and get back to you here.';
  }
}

export const REVIEW_NOTE = 'The shop owner will take a quick look and follow up here.';

export const FALLBACK_QUESTION = 'Thanks for that. Could you tell me a little more about what went wrong with your order?';

export const ESCALATION_NOTE =
  "I'm not able to settle this one myself, so I've passed it to the shop owner with everything you've told me. They'll reply here.";

export const WAITING_NOTE = "Your case is with the shop owner. We'll update this chat as soon as there's news.";

export const DISPUTE_NOTE = 'A PayPal dispute is already open for this order, so the shop owner is handling it there.';
