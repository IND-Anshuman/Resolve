// Ten tables. `actions` (every PayPal call with its request and response) and `decisions`
// (every option's cost and why one won) together are the audit trail.

import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { OptionCost, OptionKind } from '../engine/decide';
import type { GuardrailCheck } from '../engine/guardrails';
import type { ProbabilityTable } from '../settings';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export type OrderItem = { sku: string; name: string; quantity: number; unitCents: number };

// A mirror of PayPal. Re-read PayPal before any money move; never trust this alone.
export const orders = pgTable('orders', {
  id: id(),
  paypalOrderId: text('paypal_order_id').notNull().unique(),
  captureId: text('capture_id'),
  payerEmail: text('payer_email').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  items: jsonb('items').$type<OrderItem[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const shipments = pgTable(
  'shipments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    trackingNumber: text('tracking_number').notNull(),
    carrier: text('carrier').notNull(),
    // From the simulated carrier: label_created, in_transit, delivered, lost.
    status: text('status').notNull(),
    paypalTrackerId: text('paypal_tracker_id'),
    shippedAt: createdAt(),
  },
  (t) => [uniqueIndex('shipments_one_per_order').on(t.orderId)],
);

export const CASE_STATUSES = ['open', 'waiting_on_buyer', 'processing_refund', 'waiting_on_approval', 'processing_approval', 'resolved', 'became_dispute'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const cases = pgTable(
  'cases',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    status: text('status').$type<CaseStatus>().notNull().default('open'),
    complaintType: text('complaint_type'),
    outcome: text('outcome'),
    amountRefundedCents: integer('amount_refunded_cents').notNull().default(0),
    savedVsDefaultCents: integer('saved_vs_default_cents'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // One open case per order, enforced by the database as well as the guardrails.
  (t) => [uniqueIndex('cases_one_open_per_order').on(t.orderId).where(sql`${t.status} <> 'resolved'`)],
);

export const messages = pgTable('messages', {
  id: id(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id),
  role: text('role').$type<'buyer' | 'agent' | 'seller'>().notNull(),
  body: text('body').notNull(),
  attachmentUrl: text('attachment_url'),
  createdAt: createdAt(),
});

// The model's structured output, never overwritten: a new version is a new row.
export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    version: integer('version').notNull(),
    result: jsonb('result').notNull(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assessments_case_version').on(t.caseId, t.version)],
);

// The engine's math, shown in the dashboard.
export const decisions = pgTable(
  'decisions',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    version: integer('version').notNull(),
    options: jsonb('options').$type<OptionCost[]>().notNull(),
    chosen: text('chosen').$type<OptionKind>().notNull(),
    refundCents: integer('refund_cents').notNull(),
    guardrailResult: text('guardrail_result').$type<'auto_execute' | 'needs_approval' | 'blocked'>().notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull(),
    checks: jsonb('checks').$type<GuardrailCheck[]>().notNull(),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('decisions_case_version').on(t.caseId, t.version)],
);

// The only record of money moving. `request_id` is the PayPal-Request-Id, so a retry finds
// the earlier attempt instead of refunding twice.
export const actions = pgTable('actions', {
  id: id(),
  caseId: uuid('case_id').references(() => cases.id),
  kind: text('kind').$type<'refund' | 'track' | 'evidence' | 'accept_claim'>().notNull(),
  requestId: text('request_id').notNull().unique(),
  paypalRequest: jsonb('paypal_request').notNull(),
  paypalResponse: jsonb('paypal_response'),
  httpStatus: integer('http_status'),
  status: text('status').$type<'pending' | 'succeeded' | 'failed'>().notNull().default('pending'),
  createdAt: createdAt(),
});

export const disputes = pgTable('disputes', {
  id: id(),
  disputeId: text('dispute_id').notNull().unique(),
  orderId: uuid('order_id').references(() => orders.id),
  caseId: uuid('case_id').references(() => cases.id),
  reason: text('reason'),
  status: text('status').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// The unique event id stops a redelivered webhook from being processed twice.
export const webhookEvents = pgTable('webhook_events', {
  id: id(),
  eventId: text('event_id').notNull().unique(),
  type: text('type').notNull(),
  verified: boolean('verified').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: createdAt(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

// One row per store.
export const settings = pgTable('settings', {
  storeId: text('store_id').primaryKey(),
  disputeFeeCents: integer('dispute_fee_cents').notNull(),
  autoLimitCents: integer('auto_limit_cents').notNull(),
  autoMaxShareOfOrder: doublePrecision('auto_max_share_of_order').notNull(),
  dailyCapCents: integer('daily_cap_cents').notNull(),
  partialRefundShare: doublePrecision('partial_refund_share').notNull(),
  repeatRefundThreshold: integer('repeat_refund_threshold').notNull(),
  minConfidence: doublePrecision('min_confidence').notNull(),
  killSwitch: boolean('kill_switch').notNull().default(false),
  probabilities: jsonb('probabilities').$type<ProbabilityTable>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
