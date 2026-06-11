import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PayPalOrder {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
}

/** Outcome of a capture call, straight from PayPal's API response. */
export interface CaptureResult {
  completed: boolean;
  captureId: string | null;
}

export interface WebhookVerificationInput {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  rawBody: string;
}

/** Server-to-server PayPal Checkout v2 client (SPEC §8.3/§8.5). */
@Injectable()
export class PaypalClient {
  private readonly logger = new Logger(PaypalClient.name);
  private accessToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    return this.config.get<string>('PAYPAL_MODE', 'sandbox') === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60000) {
      return this.accessToken.token;
    }
    const clientId = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    const secret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    const res = await fetch(`${this.baseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`PayPal token request failed: ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  /** Creates a CAPTURE-intent order; returns the order id and buyer approval URL. */
  async createOrder(input: {
    amountCents: number;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
    payeeEmail?: string | null;
    idempotencyKey: string;
  }): Promise<{ orderId: string; approvalUrl: string }> {
    const token = await this.token();
    const amountValue = (input.amountCents / 100).toFixed(2);
    const res = await fetch(`${this.baseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': input.idempotencyKey,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: input.currency, value: amountValue },
            ...(input.payeeEmail ? { payee: { email_address: input.payeeEmail } } : {}),
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PayPal order creation failed: ${res.status} ${body}`);
    }
    const order = (await res.json()) as PayPalOrder;
    const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;
    if (!approvalUrl) {
      throw new Error('PayPal order has no approval link.');
    }
    return { orderId: order.id, approvalUrl };
  }

  /**
   * Captures an approved order (idempotent on PayPal's side) and reports the
   * outcome. A COMPLETED capture in this response is as authoritative as the
   * webhook: it comes straight from PayPal's API over TLS.
   */
  async captureOrder(orderId: string): Promise<CaptureResult> {
    const token = await this.token();
    const res = await fetch(`${this.baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${orderId}`,
      },
    });
    if (!res.ok) {
      if (res.status !== 422) {
        // 422 = already captured / not approved; tolerated (webhook reconciles).
        this.logger.warn(`PayPal capture for ${orderId} returned ${res.status}`);
      }
      return { completed: false, captureId: null };
    }
    const order = (await res.json()) as {
      status?: string;
      purchase_units?: Array<{
        payments?: { captures?: Array<{ id: string; status: string }> };
      }>;
    };
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      completed: order.status === 'COMPLETED' && capture?.status === 'COMPLETED',
      captureId: capture?.id ?? null,
    };
  }

  /** Verifies a webhook signature against the configured webhook id (SPEC §8.5). */
  async verifyWebhookSignature(input: WebhookVerificationInput): Promise<boolean> {
    try {
      const token = await this.token();
      const res = await fetch(`${this.baseUrl()}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: input.transmissionId,
          transmission_time: input.transmissionTime,
          transmission_sig: input.transmissionSig,
          cert_url: input.certUrl,
          auth_algo: input.authAlgo,
          webhook_id: this.config.get<string>('PAYPAL_WEBHOOK_ID', ''),
          webhook_event: JSON.parse(input.rawBody) as unknown,
        }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { verification_status: string };
      return data.verification_status === 'SUCCESS';
    } catch (error) {
      this.logger.warn(`Webhook verification failed: ${(error as Error).message}`);
      return false;
    }
  }
}
