// PayPal clients. Orders, Payments and Transaction Search go through the official server SDK;
// Disputes and webhook signature verification are not in the SDK, so `paypalFetch` covers
// them with plain fetch. Server-side only: both read the client secret from the environment.

import {
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaymentsController,
  TransactionSearchController,
} from '@paypal/paypal-server-sdk';

const isLive = () => process.env.PAYPAL_ENV === 'live';
export const PAYPAL_BASE_URL = () => (isLive() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

function credentials() {
  const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set (see .env.example)');
  return { id, secret };
}

let controllers:
  | { orders: OrdersController; payments: PaymentsController; transactions: TransactionSearchController }
  | undefined;

export function paypal() {
  if (controllers) return controllers;
  const { id, secret } = credentials();
  const client = new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: id, oAuthClientSecret: secret },
    environment: isLive() ? Environment.Production : Environment.Sandbox,
    timeout: 15_000,
    logging: { logLevel: LogLevel.Warn, logRequest: { logBody: false }, logResponse: { logBody: false } },
  });
  controllers = {
    orders: new OrdersController(client),
    payments: new PaymentsController(client),
    transactions: new TransactionSearchController(client),
  };
  return controllers;
}

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`PayPal ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = 'PayPalApiError';
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const { id, secret } = credentials();
  const res = await fetch(`${PAYPAL_BASE_URL()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) throw new PayPalApiError(res.status, '/v1/oauth2/token', await res.text());
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so an in-flight request never carries an expired token.
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

export async function paypalFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${PAYPAL_BASE_URL()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      body,
      cache: 'no-store',
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    // A revoked or expired token: drop it and mint a new one once.
    if (res.status === 401 && attempt === 1) {
      cachedToken = undefined;
      continue;
    }
    throw new PayPalApiError(res.status, path, await res.text());
  }
}
