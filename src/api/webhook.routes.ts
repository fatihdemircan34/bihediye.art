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

    // Suno AI callback endpoint
    this.router.post('/suno/callback', this.handleSunoCallback.bind(this));
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
   *   "service": "channels",
   *   "event": "whatsapp.inbound" | "whatsapp.outbound" | "whatsapp.interaction",
   *   "payload": {
   *     "id": "message-id",
   *     "channelId": "channel-id",
   *     "sender": { "contact": { "id": "...", "identifierValue": "+905551234567" } },
   *     "receiver": { "connector": { "id": "...", "identifierValue": "..." } },
   *     "body": {
   *       "type": "text" | "image" | "video" | "audio" | "document",
   *       "text": { "text": "message content" },
   *       "image": { "url": "..." },
   *       "video": { "url": "..." }
   *     },
   *     "status": "delivered" | "sent" | "read" | "failed",
   *     "direction": "incoming" | "outgoing",
   *     "createdAt": "2024-01-01T00:00:00Z"
   *   }
   * }
   */
  private async handleBirdWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookData = req.body;

      // Quickly respond to Bird.com
      res.sendStatus(200);

      // Log FULL payload to see actual structure
      console.log('Bird.com webhook received - FULL PAYLOAD:', JSON.stringify(webhookData, null, 2));

      const service = webhookData.service;
      const eventType = webhookData.event;
      const payload = webhookData.payload;

      console.log('Bird.com webhook received:', {
        service,
        eventType,
        messageId: payload?.id,
        channelId: payload?.channelId,
        direction: payload?.direction,
      });

      // Process event in background
      if (service === 'channels') {
        switch (eventType) {
          case 'whatsapp.inbound':
            await this.handleInboundMessage(payload);
            break;

          case 'whatsapp.outbound':
            await this.handleOutboundMessage(payload);
            break;

          case 'whatsapp.interaction':
            await this.handleInteraction(payload);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      } else {
        console.log('Unknown service:', service);
      }
    } catch (error) {
      console.error('Error processing Bird.com webhook:', error);
      // Don't send error response, already sent 200
    }
  }

  /**
   * Handle incoming message from customer (whatsapp.inbound)
   */
  private async handleInboundMessage(payload: any): Promise<void> {
    if (!this.orderService) {
      console.error('OrderService not initialized');
      return;
    }

    const sender = payload.sender?.contact;
    const body = payload.body;

    if (!sender || !body) {
      console.error('Invalid inbound message payload:', payload);
      return;
    }

    const from = sender.identifierValue;

    console.log('Inbound message received:', {
      from,
      contactId: sender.id,
      messageType: body.type,
      messageId: payload.id,
    });

    try {
      // Handle text messages
      if (body.type === 'text') {
        const text = body.text?.text;
        if (text) {
          await this.orderService.handleIncomingMessage(from, text);
        }
      }

      // Handle image messages (photos for cover image)
      else if (body.type === 'image') {
        const imageUrl = body.image?.url;
        if (imageUrl) {
          await this.orderService.handleIncomingMedia(from, imageUrl, 'image');
        }
      }

      // Handle video messages
      else if (body.type === 'video') {
        const videoUrl = body.video?.url;
        if (videoUrl) {
          await this.orderService.handleIncomingMedia(from, videoUrl, 'video');
        }
      }

      // Handle audio messages
      else if (body.type === 'audio') {
        const audioUrl = body.audio?.url;
        if (audioUrl) {
          await this.orderService.handleIncomingMedia(from, audioUrl, 'audio');
        }
      }

      // Handle document messages
      else if (body.type === 'document') {
        const documentUrl = body.document?.url;
        if (documentUrl) {
          await this.orderService.handleIncomingMedia(from, documentUrl, 'document');
        }
      }
    } catch (error) {
      console.error('Error handling inbound message:', error);
    }
  }

  /**
   * Handle outbound message status (whatsapp.outbound)
   */
  private async handleOutboundMessage(payload: any): Promise<void> {
    console.log('Outbound message status:', {
      messageId: payload.id,
      status: payload.status,
      reference: payload.reference,
      lastStatusAt: payload.lastStatusAt,
    });

    // TODO: Update message status in database
    // - sent
    // - delivered
    // - failed
  }

  /**
   * Handle interaction events (whatsapp.interaction)
   * This includes read receipts and reactions
   */
  private async handleInteraction(payload: any): Promise<void> {
    console.log('Interaction received:', {
      type: payload.type,
      messageId: payload.messageId,
      timestamp: payload.createdAt,
    });

    // TODO: Handle interactions
    // - read receipts
    // - message reactions
  }

  /**
   * Handle Suno AI callback
   * Called when music generation is complete
   */
  private async handleSunoCallback(req: Request, res: Response): Promise<void> {
    try {
      const callbackData = req.body;

      // Log full callback payload
      console.log('🎵 Suno callback received - FULL PAYLOAD:', JSON.stringify(callbackData, null, 2));

      // Quickly respond to Suno
      res.status(200).json({ success: true });

      // Extract task information
      const taskId = callbackData.taskId || callbackData.task_id;
      const status = callbackData.status;

      console.log('Suno callback processed:', {
        taskId,
        status,
        timestamp: new Date().toISOString(),
      });

      // If OrderService is available, notify about completion
      if (this.orderService && taskId) {
        // The OrderService will poll for status, so just log here
        console.log(`✅ Task ${taskId} callback received - OrderService will handle completion`);
      }
    } catch (error) {
      console.error('Error processing Suno callback:', error);
      // Already sent 200 response
    }
  }
}
