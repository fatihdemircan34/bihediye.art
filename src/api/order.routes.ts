import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderRequest, OrderResponse, OrderStatus } from '../models/order.model';
import { MinimaxService } from '../services/minimax.service';
import { OpenAIService } from '../services/openai.service';
import { WhatsAppService } from '../services/whatsapp.service';

export class OrderRoutes {
  public router: Router;
  private orders: Map<string, Order> = new Map();
  private minimaxService: MinimaxService;
  private openaiService: OpenAIService;
  private whatsappService: WhatsAppService;

  constructor(
    minimaxService: MinimaxService,
    openaiService: OpenAIService,
    whatsappService: WhatsAppService
  ) {
    this.router = Router();
    this.minimaxService = minimaxService;
    this.openaiService = openaiService;
    this.whatsappService = whatsappService;
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post('/create', this.createOrder.bind(this));
    this.router.get('/:id', this.getOrder.bind(this));
    this.router.get('/:id/status', this.getOrderStatus.bind(this));
  }

  /**
   * Create a new order
   */
  private async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderRequest: OrderRequest = req.body;
      const whatsappPhone = req.body.whatsappPhone;

      // Validate required fields
      if (!this.validateOrderRequest(orderRequest)) {
        res.status(400).json({ error: 'Eksik veya geçersiz alanlar' });
        return;
      }

      // Validate phone number
      if (!WhatsAppService.validatePhoneNumber(orderRequest.phone)) {
        res.status(400).json({ error: 'Geçersiz telefon numarası' });
        return;
      }

      // Calculate pricing
      const pricing = this.calculatePricing(orderRequest);

      const orderId = uuidv4();
      const order: Order = {
        id: orderId,
        whatsappPhone: WhatsAppService.formatPhoneNumber(whatsappPhone || orderRequest.phone),
        orderData: orderRequest,
        status: 'pending',
        basePrice: pricing.basePrice,
        additionalCosts: pricing.additionalCosts,
        totalPrice: pricing.totalPrice,
        createdAt: new Date(),
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      };

      this.orders.set(orderId, order);

      // Send confirmation to WhatsApp
      await this.whatsappService.sendOrderConfirmation(
        order.whatsappPhone,
        orderId,
        order.totalPrice,
        order.estimatedDelivery
      );

      // Start processing in background
      this.processOrder(orderId).catch(error => {
        console.error('Error processing order:', error);
        order.status = 'failed';
        order.errorMessage = error.message;
        this.whatsappService.sendErrorMessage(order.whatsappPhone, orderId, error.message);
      });

      const response: OrderResponse = {
        orderId,
        status: 'pending',
        message: 'Sipariş alındı, işleme başlandı',
        totalPrice: order.totalPrice,
        estimatedDelivery: order.estimatedDelivery,
      };

      res.status(202).json(response);
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Sipariş oluşturma hatası' });
    }
  }

  /**
   * Get order details
   */
  private async getOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.id;
      const order = this.orders.get(orderId);

      if (!order) {
        res.status(404).json({ error: 'Sipariş bulunamadı' });
        return;
      }

      res.json(order);
    } catch (error: any) {
      console.error('Error getting order:', error);
      res.status(500).json({ error: 'Sipariş bilgisi alınamadı' });
    }
  }

  /**
   * Get order status
   */
  private async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.id;
      const order = this.orders.get(orderId);

      if (!order) {
        res.status(404).json({ error: 'Sipariş bulunamadı' });
        return;
      }

      const status: OrderStatus = {
        orderId: order.id,
        status: order.status,
        progress: {
          song1Lyrics: !!order.song1Lyrics,
          song2Lyrics: !!order.song2Lyrics,
          song1Music: !!order.song1AudioUrl,
          song2Music: !!order.song2AudioUrl,
          video: !!order.videoUrl || !order.orderData.deliveryOptions.video,
        },
        completionPercentage: this.calculateCompletionPercentage(order),
      };

      res.json(status);
    } catch (error: any) {
      console.error('Error getting order status:', error);
      res.status(500).json({ error: 'Sipariş durumu alınamadı' });
    }
  }

  /**
   * Process order - generate lyrics, music, and video
   */
  private async processOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    try {
      // Step 1: Generate lyrics for both songs
      order.status = 'lyrics_generating';
      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Şarkı sözleri yazılıyor...', 10);

      const [song1Lyrics, song2Lyrics] = await Promise.all([
        this.openaiService.generateLyrics({
          songDetails: order.orderData.song1,
          story: order.orderData.story,
          recipientName: order.orderData.recipientName,
          recipientRelation: order.orderData.recipientRelation,
          includeNameInSong: order.orderData.includeNameInSong,
          notes: order.orderData.notes,
        }),
        this.openaiService.generateLyrics({
          songDetails: order.orderData.song2,
          story: order.orderData.story,
          recipientName: order.orderData.recipientName,
          recipientRelation: order.orderData.recipientRelation,
          includeNameInSong: order.orderData.includeNameInSong,
          notes: order.orderData.notes,
        }),
      ]);

      order.song1Lyrics = song1Lyrics;
      order.song2Lyrics = song2Lyrics;

      // Step 2: Generate music for both songs
      order.status = 'music_generating';
      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Müzikler oluşturuluyor...', 40);

      const [song1Task, song2Task] = await Promise.all([
        this.minimaxService.generateMusic({
          lyrics: song1Lyrics,
          songType: order.orderData.song1.type,
          style: order.orderData.song1.style,
          vocal: order.orderData.song1.vocal,
        }),
        this.minimaxService.generateMusic({
          lyrics: song2Lyrics,
          songType: order.orderData.song2.type,
          style: order.orderData.song2.style,
          vocal: order.orderData.song2.vocal,
        }),
      ]);

      order.song1MusicTaskId = song1Task.task_id;
      order.song2MusicTaskId = song2Task.task_id;

      // Wait for music generation to complete
      const [song1Music, song2Music] = await Promise.all([
        this.minimaxService.waitForTaskCompletion(song1Task.task_id),
        this.minimaxService.waitForTaskCompletion(song2Task.task_id),
      ]);

      order.song1AudioUrl = song1Music.file_url;
      order.song2AudioUrl = song2Music.file_url;

      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Müzikler hazır!', 70);

      // Step 3: Generate video if requested
      if (order.orderData.deliveryOptions.video) {
        order.status = 'video_generating';
        await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Video oluşturuluyor...', 80);

        const videoPrompt = await this.openaiService.generateVideoPrompt(
          order.orderData.story,
          order.orderData.song1.type
        );

        const videoTask = await this.minimaxService.generateVideo({
          prompt: videoPrompt,
          imageUrl: order.orderData.coverPhoto,
          duration: 30,
        });

        order.videoTaskId = videoTask.task_id;

        const videoResult = await this.minimaxService.waitForTaskCompletion(videoTask.task_id);
        order.videoUrl = videoResult.file_url;
      }

      // Step 4: Complete order
      order.status = 'completed';
      order.completedAt = new Date();

      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Tamamlandı!', 100);
      await this.whatsappService.sendOrderCompletion(order.whatsappPhone, orderId);

      // Send files
      await this.deliverOrder(order);

    } catch (error: any) {
      console.error('Error processing order:', error);
      order.status = 'failed';
      order.errorMessage = error.message;
      throw error;
    }
  }

  /**
   * Deliver order files to customer via WhatsApp
   */
  private async deliverOrder(order: Order): Promise<void> {
    try {
      // Send Song 1
      if (order.song1AudioUrl) {
        await this.whatsappService.sendAudioMessage(order.whatsappPhone, order.song1AudioUrl);
        await this.whatsappService.sendTextMessage(
          order.whatsappPhone,
          `🎵 *Şarkı 1*\nTür: ${order.orderData.song1.type}\nTarz: ${order.orderData.song1.style}`
        );
      }

      // Send Song 2
      if (order.song2AudioUrl) {
        await this.whatsappService.sendAudioMessage(order.whatsappPhone, order.song2AudioUrl);
        await this.whatsappService.sendTextMessage(
          order.whatsappPhone,
          `🎵 *Şarkı 2*\nTür: ${order.orderData.song2.type}\nTarz: ${order.orderData.song2.style}`
        );
      }

      // Send Video
      if (order.videoUrl && order.orderData.deliveryOptions.video) {
        await this.whatsappService.sendVideoMessage(
          order.whatsappPhone,
          order.videoUrl,
          'Hediyenizin videosu 🎬'
        );
      }

      // Send SoundCloud link if requested
      if (order.soundcloudUrl && order.orderData.deliveryOptions.musicPlatform) {
        await this.whatsappService.sendTextMessage(
          order.whatsappPhone,
          `🎧 *SoundCloud Linki*\n${order.soundcloudUrl}`
        );
      }

    } catch (error) {
      console.error('Error delivering order:', error);
      throw error;
    }
  }

  /**
   * Validate order request
   */
  private validateOrderRequest(request: OrderRequest): boolean {
    if (!request.song1 || !request.song2) return false;
    if (!request.story || request.story.length === 0) return false;
    if (!request.phone) return false;
    if (!request.deliveryOptions) return false;

    // If video is requested, cover photo is required
    if (request.deliveryOptions.video && !request.coverPhoto) return false;

    // If name should be included, recipientName is required
    if (request.includeNameInSong && !request.recipientName) return false;

    return true;
  }

  /**
   * Calculate order pricing
   */
  private calculatePricing(request: OrderRequest): {
    basePrice: number;
    additionalCosts: number;
    totalPrice: number;
  } {
    const basePrice = 299; // Base price for 2 songs
    let additionalCosts = 0;

    if (request.deliveryOptions.musicPlatform) {
      additionalCosts += 79; // SoundCloud
    }

    if (request.deliveryOptions.video) {
      additionalCosts += 79; // Video
    }

    return {
      basePrice,
      additionalCosts,
      totalPrice: basePrice + additionalCosts,
    };
  }

  /**
   * Calculate completion percentage
   */
  private calculateCompletionPercentage(order: Order): number {
    let completed = 0;
    let total = 4; // 2 lyrics + 2 music

    if (order.song1Lyrics) completed++;
    if (order.song2Lyrics) completed++;
    if (order.song1AudioUrl) completed++;
    if (order.song2AudioUrl) completed++;

    if (order.orderData.deliveryOptions.video) {
      total++;
      if (order.videoUrl) completed++;
    }

    return Math.round((completed / total) * 100);
  }
}
