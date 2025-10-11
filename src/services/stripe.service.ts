import Stripe from 'stripe';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

export interface StripePaymentRequest {
  orderId: string;
  email: string;
  amount: number;
  userName: string;
  userPhone: string;
  basketItems: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
}

export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2024-12-18.acacia',
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create Stripe Checkout Session for payment
   */
  async createCheckoutSession(
    request: StripePaymentRequest,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ url: string; sessionId: string }> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: request.basketItems.map(item => ({
          price_data: {
            currency: 'try',
            product_data: {
              name: item.name,
            },
            unit_amount: Math.round(item.price * 100), // Convert to kuruş
          },
          quantity: item.quantity,
        })),
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: request.email,
        metadata: {
          orderId: request.orderId,
          userPhone: request.userPhone,
          userName: request.userName,
        },
        locale: 'tr',
      });

      if (!session.url) {
        throw new Error('Stripe session URL not generated');
      }

      return {
        url: session.url,
        sessionId: session.id,
      };
    } catch (error: any) {
      console.error('Stripe checkout session error:', error);
      throw new Error(`Stripe ödeme oluşturma hatası: ${error.message}`);
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
      return event;
    } catch (error: any) {
      console.error('Stripe webhook verification failed:', error);
      throw new Error(`Webhook doğrulama hatası: ${error.message}`);
    }
  }

  /**
   * Retrieve checkout session details
   */
  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return session;
    } catch (error: any) {
      console.error('Error retrieving checkout session:', error);
      throw new Error(`Session bilgisi alınamadı: ${error.message}`);
    }
  }

  /**
   * Create refund for a payment
   */
  async createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });
      return refund;
    } catch (error: any) {
      console.error('Error creating refund:', error);
      throw new Error(`İade işlemi başarısız: ${error.message}`);
    }
  }
}
