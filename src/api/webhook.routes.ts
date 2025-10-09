import { Router, Request, Response } from 'express';
import { OrderService } from '../services/order.service';

/**
 * Bird.com webhook format
 * https://docs.bird.com/channels/whatsapp/webhooks
 */

export class WebhookRoutes {
  public router: Router;
  private orderService?: OrderService;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  /**
   * Set order service (called from index.ts after initialization)
   */
  setOrderService(orderService: OrderService): void {
    this.orderService = orderService;
  }

  private initializeRoutes(): void {
    // Bird.com webhook endpoint
    this.router.post('/bird', this.handleBirdWebhook.bind(this));

    // Health check for webhook
    this.router.get('/bird', this.verifyWebhook.bind(this));
  }

  /**
   * Verify Bird.com webhook (optional)
   */
  private verifyWebhook(req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      service: 'Bird.com WhatsApp Webhook',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle incoming Bird.com webhook events
   *
   * Bird.com sends events in this format:
   * {
   *   "id": "message-id",
   *   "type": "message.received" | "message.sent" | "message.delivered" | "message.read" | "message.failed",
   *   "timestamp": "2024-01-01T00:00:00Z",
   *   "channelId": "channel-id",
   *   "contact": {
   *     "id": "contact-id",
   *     "identifierValue": "+905551234567"
   *   },
   *   "message": {
   *     "id": "msg-id",
   *     "type": "text" | "media",
   *     "text": { "text": "message content" },
   *     "media": { "url": "...", "mediaType": "..." }
   *   }
   * }
   */
  private async handleBirdWebhook(req: Request, res: Response): Promise<void> {
    try {
      const event = req.body;

      // Quickly respond to Bird.com
      res.sendStatus(200);

      console.log('Bird.com webhook received:', {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        channelId: event.channelId,
      });

      // Process event in background
      switch (event.type) {
        case 'message.received':
          await this.handleMessageReceived(event);
          break;

        case 'message.sent':
          await this.handleMessageSent(event);
          break;

        case 'message.delivered':
          await this.handleMessageDelivered(event);
          break;

        case 'message.read':
          await this.handleMessageRead(event);
          break;

        case 'message.failed':
          await this.handleMessageFailed(event);
          break;

        default:
          console.log('Unknown event type:', event.type);
      }
    } catch (error) {
      console.error('Error processing Bird.com webhook:', error);
      // Don't send error response, already sent 200
    }
  }

  /**
   * Handle incoming message from customer
   */
  private async handleMessageReceived(event: any): Promise<void> {
    if (!this.orderService) {
      console.error('OrderService not initialized');
      return;
    }

    const contact = event.contact;
    const message = event.message;

    if (!contact || !message) {
      console.error('Invalid message event:', event);
      return;
    }

    const from = contact.identifierValue;

    console.log('Message received:', {
      from,
      contactId: contact.id,
      messageType: message.type,
      messageId: message.id,
    });

    try {
      // Handle text messages
      if (message.type === 'text') {
        const text = message.text?.text;
        if (text) {
          await this.orderService.handleIncomingMessage(from, text);
        }
      }

      // Handle media messages (photos for cover image)
      else if (message.type === 'media') {
        const mediaUrl = message.media?.url;
        const mediaType = message.media?.mediaType;

        if (mediaUrl && mediaType) {
          await this.orderService.handleIncomingMedia(from, mediaUrl, mediaType);
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle message sent status
   */
  private async handleMessageSent(event: any): Promise<void> {
    console.log('Message sent:', {
      messageId: event.message?.id,
      timestamp: event.timestamp,
    });

    // TODO: Update message status in database
  }

  /**
   * Handle message delivered status
   */
  private async handleMessageDelivered(event: any): Promise<void> {
    console.log('Message delivered:', {
      messageId: event.message?.id,
      timestamp: event.timestamp,
    });

    // TODO: Update delivery status
  }

  /**
   * Handle message read status
   */
  private async handleMessageRead(event: any): Promise<void> {
    console.log('Message read:', {
      messageId: event.message?.id,
      timestamp: event.timestamp,
    });

    // TODO: Update read status
  }

  /**
   * Handle message failed status
   */
  private async handleMessageFailed(event: any): Promise<void> {
    console.error('Message failed:', {
      messageId: event.message?.id,
      timestamp: event.timestamp,
      error: event.error,
    });

    // TODO: Handle message failure
    // - Retry sending
    // - Notify admin
    // - Update order status
  }
}
