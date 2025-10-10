import axios from 'axios';

/**
 * Google Analytics 4 Measurement Protocol Service
 * FREE & UNLIMITED backend analytics
 *
 * Setup:
 * 1. Go to: https://analytics.google.com
 * 2. Create GA4 property
 * 3. Get Measurement ID (G-XXXXXXXXXX)
 * 4. Get API Secret: Admin > Data Streams > Select stream > Measurement Protocol API secrets
 */
export class GA4Service {
  private measurementId: string;
  private apiSecret: string;
  private endpoint: string;

  constructor(measurementId: string, apiSecret: string) {
    this.measurementId = measurementId;
    this.apiSecret = apiSecret;
    this.endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
  }

  /**
   * Log event to GA4
   * @param eventName - Event name (e.g., 'conversation_started')
   * @param params - Event parameters
   * @param userId - User ID (phone number)
   */
  async logEvent(eventName: string, params: any = {}, userId?: string): Promise<void> {
    try {
      const payload = {
        client_id: userId || this.generateClientId(),
        user_id: userId,
        events: [
          {
            name: eventName,
            params: {
              ...params,
              timestamp: new Date().toISOString(),
            },
          },
        ],
      };

      await axios.post(this.endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      console.log(`✅ GA4 event logged: ${eventName}`);
    } catch (error: any) {
      console.error(`❌ GA4 error logging event ${eventName}:`, error.message);
      // Don't throw - analytics should not break the app
    }
  }

  /**
   * Log multiple events in batch
   */
  async logEvents(events: Array<{ name: string; params: any }>, userId?: string): Promise<void> {
    try {
      const payload = {
        client_id: userId || this.generateClientId(),
        user_id: userId,
        events: events.map(event => ({
          name: event.name,
          params: {
            ...event.params,
            timestamp: new Date().toISOString(),
          },
        })),
      };

      await axios.post(this.endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      console.log(`✅ GA4 batch logged: ${events.length} events`);
    } catch (error: any) {
      console.error(`❌ GA4 error logging batch:`, error.message);
    }
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Log conversation started
   */
  async logConversationStarted(phone: string): Promise<void> {
    await this.logEvent('conversation_started', {
      user_phone: phone,
    }, phone);
  }

  /**
   * Log conversation completed
   */
  async logConversationCompleted(phone: string, songType: string, songStyle: string): Promise<void> {
    await this.logEvent('conversation_completed', {
      user_phone: phone,
      song_type: songType,
      song_style: songStyle,
    }, phone);
  }

  /**
   * Log conversation abandoned
   */
  async logConversationAbandoned(phone: string, step: string, reason?: string): Promise<void> {
    await this.logEvent('conversation_abandoned', {
      user_phone: phone,
      step,
      reason: reason || 'user_cancelled',
    }, phone);
  }

  /**
   * Log song type selected
   */
  async logSongTypeSelected(phone: string, songType: string): Promise<void> {
    await this.logEvent('song_type_selected', {
      user_phone: phone,
      song_type: songType,
    }, phone);
  }

  /**
   * Log song style selected
   */
  async logSongStyleSelected(phone: string, songStyle: string, songType: string): Promise<void> {
    await this.logEvent('song_style_selected', {
      user_phone: phone,
      song_style: songStyle,
      song_type: songType,
    }, phone);
  }

  /**
   * Log order created
   */
  async logOrderCreated(orderId: string, phone: string, totalPrice: number): Promise<void> {
    await this.logEvent('order_created', {
      order_id: orderId,
      user_phone: phone,
      value: totalPrice,
      currency: 'TRY',
    }, phone);
  }

  /**
   * Log payment link sent
   */
  async logPaymentLinkSent(orderId: string, phone: string, amount: number): Promise<void> {
    await this.logEvent('payment_link_sent', {
      order_id: orderId,
      user_phone: phone,
      value: amount,
      currency: 'TRY',
    }, phone);
  }

  /**
   * Log payment completed
   */
  async logPaymentCompleted(orderId: string, phone: string, amount: number): Promise<void> {
    await this.logEvent('purchase', { // GA4 recommended event name
      transaction_id: orderId,
      user_phone: phone,
      value: amount,
      currency: 'TRY',
    }, phone);
  }

  /**
   * Log lyrics generation started
   */
  async logLyricsGenerationStarted(orderId: string, phone: string, songType: string): Promise<void> {
    await this.logEvent('lyrics_generation_started', {
      order_id: orderId,
      user_phone: phone,
      song_type: songType,
    }, phone);
  }

  /**
   * Log music generation started
   */
  async logMusicGenerationStarted(orderId: string, phone: string, songType: string): Promise<void> {
    await this.logEvent('music_generation_started', {
      order_id: orderId,
      user_phone: phone,
      song_type: songType,
    }, phone);
  }

  /**
   * Log order completed
   */
  async logOrderCompleted(orderId: string, phone: string, totalPrice: number): Promise<void> {
    await this.logEvent('order_completed', {
      order_id: orderId,
      user_phone: phone,
      value: totalPrice,
      currency: 'TRY',
    }, phone);
  }

  /**
   * Log order delivered
   */
  async logOrderDelivered(orderId: string, phone: string, songType: string): Promise<void> {
    await this.logEvent('order_delivered', {
      order_id: orderId,
      user_phone: phone,
      song_type: songType,
    }, phone);
  }
}
