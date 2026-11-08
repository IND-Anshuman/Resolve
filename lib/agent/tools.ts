// The model's tools. All are read-only, and none takes an order id or email: they are bound to
// the order the buyer already proved is theirs, so the model cannot look at anyone else's.
// There is deliberately no tool that moves money.

import type OpenAI from 'openai';
import { z } from 'zod';
import type { ShipmentInfo } from '../carrier/simulated';
import { formatUsd, type Cents } from '../money';
import { POLICY_TOPICS } from '../store/policy';
import { assessmentSchema } from './assessment';

export type SimilarCase = {
  id: string;
  complaintType: string | null;
  outcome: string | null;
  summary: string;
  score: number;
};

export type OrderFacts = {
  status: string;
  placedAt: string;
  items: { name: string; quantity: number; unitCents: Cents }[];
  totalCents: Cents;
  refundedSoFarCents: Cents;
};

export type BuyerHistory = { ordersLast90Days: number; refundsLast90Days: number };

export type AgentContext = {
  getOrder(): Promise<OrderFacts>;
  getShipment(): Promise<ShipmentInfo | null>;
  getPolicy(topic: string): string[] | Promise<string[]>;
  getBuyerHistory(): Promise<BuyerHistory>;
  findSimilarCases?(query: string, complaintType?: string): Promise<SimilarCase[]>;
};

const tool = (name: string, description: string, parameters: Record<string, unknown>): OpenAI.ChatCompletionTool => ({
  type: 'function',
  function: { name, description, parameters },
});

export const TOOLS: OpenAI.ChatCompletionTool[] = [
  tool('get_order', "The buyer's order: items, total, date and any refunds already made. Read live from PayPal.", {
    type: 'object',
    properties: {},
  }),
  tool('get_shipment', "Tracking number, carrier and the latest delivery status for the buyer's order.", {
    type: 'object',
    properties: {},
  }),
  tool('get_policy', "The shop's policy lines for one topic.", {
    type: 'object',
    properties: { topic: { type: 'string', enum: [...POLICY_TOPICS] } },
    required: ['topic'],
  }),
  tool('get_buyer_history', 'How many orders and refunds this buyer has had in the last 90 days.', {
    type: 'object',
    properties: {},
  }),
  tool('find_similar_cases', 'Find up to three resolved cases with similar facts. Use these only as context; the current order and policy remain authoritative.', {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Short description of the complaint and relevant delivery facts' },
      complaint_type: { type: 'string', description: 'Optional complaint category' },
    },
    required: ['query'],
  }),
  tool(
    'submit_assessment',
    'Report your findings and end your turn. This records the assessment only. It does not refund or change anything.',
    z.toJSONSchema(assessmentSchema, { target: 'draft-7' }) as Record<string, unknown>,
  ),
];

export type ToolTrace = { tool: string; summary: string };

// Runs one read-only tool and returns text for the model plus a one-line summary for the UI.
export async function runTool(
  name: string,
  input: unknown,
  ctx: AgentContext,
): Promise<{ content: string; summary: string }> {
  switch (name) {
    case 'get_order': {
      const o = await ctx.getOrder();
      return {
        content: JSON.stringify({
          status: o.status,
          placed_at: o.placedAt,
          items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: formatUsd(i.unitCents) })),
          total: formatUsd(o.totalCents),
          refunded_so_far: formatUsd(o.refundedSoFarCents),
        }),
        summary: `Order: ${o.items.map((i) => i.name).join(', ')} (${formatUsd(o.totalCents)})`,
      };
    }
    case 'get_shipment': {
      const s = await ctx.getShipment();
      if (!s) return { content: JSON.stringify({ error: 'No shipment recorded for this order' }), summary: 'No shipment found' };
      return {
        content: JSON.stringify({ tracking_number: s.trackingNumber, carrier: s.carrier, status: s.status, details: s.summary }),
        summary: `Shipment: ${s.status.replaceAll('_', ' ')}`,
      };
    }
    case 'get_policy': {
      const topic = z.object({ topic: z.string() }).parse(input).topic;
      const lines = await ctx.getPolicy(topic);
      return { content: JSON.stringify({ topic, lines }), summary: `Policy: ${topic.replaceAll('_', ' ')}` };
    }
    case 'get_buyer_history': {
      const h = await ctx.getBuyerHistory();
      return {
        content: JSON.stringify({ orders_last_90_days: h.ordersLast90Days, refunds_last_90_days: h.refundsLast90Days }),
        summary: `History: ${h.ordersLast90Days} orders, ${h.refundsLast90Days} refunds in 90 days`,
      };
    }
    case 'find_similar_cases': {
      const parsed = z.object({ query: z.string().min(1).max(500), complaint_type: z.string().max(80).optional() }).parse(input);
      const cases = ctx.findSimilarCases ? await ctx.findSimilarCases(parsed.query, parsed.complaint_type) : [];
      return {
        content: JSON.stringify({ cases: cases.map((c) => ({ complaint_type: c.complaintType, outcome: c.outcome, summary: c.summary })) }),
        summary: cases.length ? `Similar cases: ${cases.length} found` : 'Similar cases: none available',
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
