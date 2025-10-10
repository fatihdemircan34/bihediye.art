import { v4 as uuidv4 } from 'uuid';
import { Order, OrderRequest } from '../models/order.model';
import { MinimaxService } from './minimax.service';
import { OpenAIService } from './openai.service';
import { WhatsAppService } from './whatsapp.service';
import { FirebaseService } from './firebase.service';
import { FirebaseQueueService } from './firebase-queue.service';
import { PaytrService } from './paytr.service';

/**
 * Conversation state for collecting order information via WhatsApp
 */
export interface ConversationState {
  phone: string;
  step:
    | 'welcome'
    | 'song1_type'
    | 'song1_style'
    | 'song1_vocal'
    | 'recipient_relation'
    | 'name_in_song'
    | 'recipient_name'
    | 'story'
    | 'notes'
    | 'delivery_options'
    | 'cover_photo'
    | 'confirm'
    | 'processing';
  data: Partial<OrderRequest>;
  lastUpdated: Date;
}

export class OrderService {
  private queueService?: FirebaseQueueService;
  private paytrService?: PaytrService;

  constructor(
    private minimaxService: MinimaxService,
    private openaiService: OpenAIService,
    private whatsappService: WhatsAppService,
    private firebaseService: FirebaseService,
    queueService?: FirebaseQueueService,
    paytrService?: PaytrService
  ) {
    this.queueService = queueService;
    this.paytrService = paytrService;
    // Start cleanup job for old conversations
    this.startCleanupJob();
  }

  /**
   * Start cleanup job for old conversations (runs every hour)
   */
  private startCleanupJob(): void {
    setInterval(async () => {
      try {
        await this.firebaseService.cleanupOldConversations();
      } catch (error) {
        console.error('Cleanup job error:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Handle incoming WhatsApp message
   */
  async handleIncomingMessage(from: string, message: string): Promise<void> {
    // Load conversation from Firebase
    let conversation = await this.firebaseService.getConversation(from);

    if (!conversation) {
      // Start new conversation
      conversation = {
        phone: from,
        step: 'welcome',
        data: {},
        lastUpdated: new Date(),
      };
    }

    // Update last activity
    conversation.lastUpdated = new Date();

    // Handle special commands
    if (message.toLowerCase() === 'iptal' || message.toLowerCase() === 'cancel') {
      await this.firebaseService.deleteConversation(from);
      await this.whatsappService.sendTextMessage(from, '❌ Sipariş iptal edildi. Yeni sipariş için "merhaba" yazın.');
      return;
    }

    if (message.toLowerCase() === 'yardim' || message.toLowerCase() === 'help') {
      await this.sendHelpMessage(from);
      return;
    }

    // Process based on current step
    await this.processConversationStep(conversation, message);

    // Save conversation state to Firebase
    await this.firebaseService.saveConversation(conversation);
  }

  /**
   * Process conversation step
   */
  private async processConversationStep(conversation: ConversationState, message: string): Promise<void> {
    const from = conversation.phone;

    switch (conversation.step) {
      case 'welcome':
        await this.whatsappService.sendTextMessage(
          from,
          `🎵 *bihediye.art'a Hoş Geldiniz!*

Yapay zeka ile kişiye özel şarkı hediyesi oluşturuyoruz.

*Paket İçeriği:*
🎵 1 Özel Şarkı (2+ dakika)
💰 Fiyat: 350 TL

*Şarkının Türünü* seçin:

1️⃣ Pop
2️⃣ Rap
3️⃣ Jazz
4️⃣ Arabesk
5️⃣ Klasik
6️⃣ Rock
7️⃣ Metal
8️⃣ Nostaljik

_İptal etmek için "iptal" yazın_`
        );
        conversation.step = 'song1_type';
        break;

      case 'song1_type':
        const song1Type = this.parseMusicType(message);
        if (!song1Type) {
          await this.whatsappService.sendTextMessage(from, '❌ Geçersiz seçim. Lütfen 1-8 arası numara girin.');
          return;
        }
        conversation.data.song1 = { type: song1Type } as any;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ Şarkı Türü: ${song1Type}

*Şarkının Tarzını* seçin:

1️⃣ Romantik
2️⃣ Duygusal
3️⃣ Eğlenceli
4️⃣ Sakin`
        );
        conversation.step = 'song1_style';
        break;

      case 'song1_style':
        const song1Style = this.parseStyle(message);
        if (!song1Style) {
          await this.whatsappService.sendTextMessage(from, '❌ Geçersiz seçim. Lütfen 1-4 arası numara girin.');
          return;
        }
        conversation.data.song1!.style = song1Style;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ Tarz: ${song1Style}

*Vokal Seçimi:*

1️⃣ Kadın
2️⃣ Erkek
3️⃣ Fark etmez`
        );
        conversation.step = 'song1_vocal';
        break;

      case 'song1_vocal':
        const song1Vocal = this.parseVocal(message);
        if (!song1Vocal) {
          await this.whatsappService.sendTextMessage(from, '❌ Geçersiz seçim. Lütfen 1-3 arası numara girin.');
          return;
        }
        conversation.data.song1!.vocal = song1Vocal;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ Şarkı Ayarları Tamamlandı! 🎵

Şarkıyı *hediye edeceğiniz kişi sizin neyiniz?*

Örnek: Annem, Babam, Sevgilim, Arkadaşım`
        );
        conversation.step = 'recipient_relation';
        break;

      case 'recipient_relation':
        conversation.data.recipientRelation = message;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ Hediye: ${message}

*Şarkıda isim geçsin mi?*

1️⃣ Evet (isim geçsin)
2️⃣ Hayır (isim geçmesin)`
        );
        conversation.step = 'name_in_song';
        break;

      case 'name_in_song':
        if (message === '1') {
          conversation.data.includeNameInSong = true;
          await this.whatsappService.sendTextMessage(
            from,
            `*Hediye edeceğiniz kişinin adı nedir?*

Tam adını yazın:`
          );
          conversation.step = 'recipient_name';
        } else if (message === '2') {
          conversation.data.includeNameInSong = false;
          await this.whatsappService.sendTextMessage(
            from,
            `✅ Şarkıda isim geçmeyecek

Şimdi şarkının *hikayesini* yazın:

Şarkıda geçmesini istediğiniz duygular, anılar, hikayeniz...
(Max 900 karakter)`
          );
          conversation.step = 'story';
        } else {
          await this.whatsappService.sendTextMessage(from, '❌ Lütfen 1 veya 2 yazın.');
        }
        break;

      case 'recipient_name':
        conversation.data.recipientName = message;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ İsim: ${message}

Şimdi şarkının *hikayesini* yazın:

Şarkıda geçmesini istediğiniz duygular, anılar, hikayeniz...
(Max 900 karakter)`
        );
        conversation.step = 'story';
        break;

      case 'story':
        if (message.length > 900) {
          await this.whatsappService.sendTextMessage(
            from,
            '❌ Hikaye çok uzun. Lütfen 900 karakterden kısa yazın.'
          );
          return;
        }
        conversation.data.story = message;
        await this.whatsappService.sendTextMessage(
          from,
          `✅ Hikaye alındı

*Ek notlarınız var mı?*

Şarkı ile ilgili belirtmek istediğiniz notlar...
(Max 300 karakter)

Yoksa "hayır" yazın.`
        );
        conversation.step = 'notes';
        break;

      case 'notes':
        if (message.toLowerCase() !== 'hayır' && message.toLowerCase() !== 'hayir') {
          if (message.length > 300) {
            await this.whatsappService.sendTextMessage(from, '❌ Not çok uzun. Max 300 karakter.');
            return;
          }
          conversation.data.notes = message;
        }
        // Directly set delivery options (audio only)
        conversation.data.deliveryOptions = {
          audioFile: true,
          musicPlatform: false,
          video: false
        };
        await this.sendOrderConfirmation(conversation);
        break;

      case 'confirm':
        if (message === '1') {
          await this.createOrderAndSendPaymentLink(conversation);
        } else if (message === '2') {
          await this.firebaseService.deleteConversation(from);
          await this.whatsappService.sendTextMessage(
            from,
            '❌ Sipariş iptal edildi. Yeni sipariş için "merhaba" yazın.'
          );
        } else {
          await this.whatsappService.sendTextMessage(from, '❌ Lütfen 1 (Onayla) veya 2 (İptal) yazın.');
        }
        break;
    }
  }

  /**
   * Handle media (photo) from WhatsApp
   */
  async handleIncomingMedia(from: string, mediaUrl: string, mediaType: string): Promise<void> {
    const conversation = await this.firebaseService.getConversation(from);

    if (!conversation) {
      await this.whatsappService.sendTextMessage(
        from,
        'Önce sipariş başlatmalısınız. "merhaba" yazın.'
      );
      return;
    }

    if (conversation.step === 'cover_photo' && mediaType === 'image') {
      conversation.data.coverPhoto = mediaUrl;
      await this.sendOrderConfirmation(conversation);
      await this.firebaseService.saveConversation(conversation);
    }
  }

  /**
   * Send order confirmation
   */
  private async sendOrderConfirmation(conversation: ConversationState): Promise<void> {
    const data = conversation.data;
    const price = this.calculatePrice(data.deliveryOptions!);

    const summary = `📋 *Sipariş Özeti*

*Şarkınız:*
🎵 Tür: ${data.song1?.type}
🎭 Tarz: ${data.song1?.style}
🎤 Vokal: ${data.song1?.vocal || 'Fark etmez'}
⏱️ Süre: 2+ dakika

*Hediye Bilgileri:*
👤 Kime: ${data.recipientRelation}
${data.includeNameInSong ? `📝 İsim: ${data.recipientName}` : '📝 İsim geçmeyecek'}

*Teslimat:*
${data.deliveryOptions?.audioFile ? '✅ Ses Dosyası\n' : ''}${data.deliveryOptions?.musicPlatform ? '✅ SoundCloud\n' : ''}${data.deliveryOptions?.video ? '✅ Video\n' : ''}

💰 *Toplam: ${price} TL*

⏰ Teslimat: 2 saat içinde

Onaylıyor musunuz?
1️⃣ Evet, Sipariş Ver
2️⃣ Hayır, İptal Et`;

    await this.whatsappService.sendTextMessage(conversation.phone, summary);
    conversation.step = 'confirm';
  }

  /**
   * Create order and send payment link
   */
  private async createOrderAndSendPaymentLink(conversation: ConversationState): Promise<void> {
    try {
      const orderId = uuidv4();
      const orderRequest: OrderRequest = conversation.data as OrderRequest;
      orderRequest.phone = conversation.phone;

      const pricing = this.calculatePriceDetails(orderRequest.deliveryOptions);

      const order: Order = {
        id: orderId,
        whatsappPhone: conversation.phone,
        orderData: orderRequest,
        status: 'payment_pending', // Ödeme bekliyor
        basePrice: pricing.basePrice,
        additionalCosts: pricing.additionalCosts,
        totalPrice: pricing.totalPrice,
        createdAt: new Date(),
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      // Save order to Firebase
      await this.firebaseService.saveOrder(order);

      conversation.step = 'processing';
      await this.firebaseService.saveConversation(conversation);

      // Log analytics
      await this.firebaseService.logAnalytics('order_created', {
        orderId,
        phone: conversation.phone,
        totalPrice: order.totalPrice,
      });

      // Generate payment link and send
      if (this.paytrService) {
        await this.sendPaymentLink(order);
      } else {
        // Fallback: No payment required (test mode)
        console.warn('⚠️ PayTR service not configured - processing without payment');
        await this.whatsappService.sendOrderConfirmation(
          conversation.phone,
          orderId,
          order.totalPrice,
          order.estimatedDelivery
        );
        this.processOrder(orderId);
      }

      // Clean up conversation after 5 seconds
      setTimeout(async () => {
        await this.firebaseService.deleteConversation(conversation.phone);
      }, 5000);

    } catch (error: any) {
      console.error('Error creating order:', error);
      await this.whatsappService.sendTextMessage(
        conversation.phone,
        `❌ Sipariş oluşturulurken hata: ${error.message}`
      );
    }
  }

  /**
   * Send payment link to customer
   */
  private async sendPaymentLink(order: Order): Promise<void> {
    try {
      if (!this.paytrService) {
        throw new Error('PayTR service not configured');
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // Ödeme token oluştur
      const tokenResponse = await this.paytrService.createPaymentToken(
        {
          orderId: order.id,
          email: order.orderData.recipientName
            ? `${order.orderData.recipientName.toLowerCase().replace(/\s/g, '')}@bihediye.art`
            : 'customer@bihediye.art',
          amount: order.totalPrice,
          userIp: '85.34.0.1', // WhatsApp kullanıcısı için varsayılan IP
          userName: order.orderData.recipientName || 'Müşteri',
          userPhone: order.whatsappPhone,
          basketItems: [
            {
              name: `${order.orderData.song1.type} Şarkı Hediyesi`,
              price: order.totalPrice,
              quantity: 1,
            },
          ],
        },
        `${baseUrl}/payment/success?orderId=${order.id}`,
        `${baseUrl}/payment/fail?orderId=${order.id}`
      );

      if (tokenResponse.status === 'success' && tokenResponse.token) {
        const paymentUrl = `${baseUrl}/payment/${order.id}`;

        // Kullanıcıya ödeme linki gönder
        await this.whatsappService.sendTextMessage(
          order.whatsappPhone,
          `✅ *Sipariş Oluşturuldu!*

🎵 Sipariş No: ${order.id}
💰 Tutar: ${order.totalPrice} TL

*Ödeme yapmak için:*
👉 ${paymentUrl}

⏰ Link 30 dakika geçerlidir.

Ödeme tamamlandıktan sonra şarkınızın hazırlanmasına başlanacaktır!`
        );

        // Store payment token in order
        await this.firebaseService.updateOrder(order.id, {
          paymentToken: tokenResponse.token,
        });

        console.log(`💳 Payment link sent for order ${order.id}`);
      } else {
        throw new Error(`PayTR token error: ${tokenResponse.reason || 'Unknown'}`);
      }
    } catch (error: any) {
      console.error('Error sending payment link:', error);
      await this.whatsappService.sendTextMessage(
        order.whatsappPhone,
        `❌ Ödeme linki oluşturulamadı. Lütfen daha sonra tekrar deneyin.`
      );
      throw error;
    }
  }

  /**
   * Handle successful payment (called from webhook)
   */
  async handlePaymentSuccess(orderId: string): Promise<void> {
    try {
      const order = await this.firebaseService.getOrder(orderId);
      if (!order) {
        console.error(`Order not found: ${orderId}`);
        return;
      }

      // Check if already processed
      if (order.status !== 'payment_pending') {
        console.log(`Order ${orderId} already processed (status: ${order.status})`);
        return;
      }

      // Update order status
      await this.firebaseService.updateOrder(orderId, {
        status: 'paid',
        paidAt: new Date(),
      });

      // Send confirmation
      await this.whatsappService.sendOrderConfirmation(
        order.whatsappPhone,
        orderId,
        order.totalPrice,
        order.estimatedDelivery
      );

      // Start processing
      await this.processOrder(orderId);

      console.log(`✅ Payment processed for order ${orderId}`);
    } catch (error: any) {
      console.error('Error handling payment success:', error);
      throw error;
    }
  }

  /**
   * Create order from conversation (legacy - kept for compatibility)
   */
  private async createOrderFromConversation(conversation: ConversationState): Promise<void> {
    try {
      const orderId = uuidv4();
      const orderRequest: OrderRequest = conversation.data as OrderRequest;
      orderRequest.phone = conversation.phone;

      const pricing = this.calculatePriceDetails(orderRequest.deliveryOptions);

      const order: Order = {
        id: orderId,
        whatsappPhone: conversation.phone,
        orderData: orderRequest,
        status: 'pending',
        basePrice: pricing.basePrice,
        additionalCosts: pricing.additionalCosts,
        totalPrice: pricing.totalPrice,
        createdAt: new Date(),
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      // Save order to Firebase
      await this.firebaseService.saveOrder(order);

      conversation.step = 'processing';
      await this.firebaseService.saveConversation(conversation);

      // Send confirmation
      await this.whatsappService.sendOrderConfirmation(
        conversation.phone,
        orderId,
        order.totalPrice,
        order.estimatedDelivery
      );

      // Log analytics
      await this.firebaseService.logAnalytics('order_created', {
        orderId,
        phone: conversation.phone,
        totalPrice: order.totalPrice,
      });

      // Start processing
      this.processOrder(orderId);

      // Clean up conversation after 5 seconds
      setTimeout(async () => {
        await this.firebaseService.deleteConversation(conversation.phone);
      }, 5000);

    } catch (error: any) {
      console.error('Error creating order:', error);
      await this.whatsappService.sendTextMessage(
        conversation.phone,
        `❌ Sipariş oluşturulurken hata: ${error.message}`
      );
    }
  }

  /**
   * Process order (same as order.routes.ts)
   */
  private async processOrder(orderId: string): Promise<void> {
    const order = await this.firebaseService.getOrder(orderId);
    if (!order) return;

    try {
      // Generate lyrics
      order.status = 'lyrics_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'lyrics_generating' });
      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Şarkı sözleri yazılıyor...', 10);

      const song1Lyrics = await this.openaiService.generateLyrics({
        songDetails: order.orderData.song1,
        story: order.orderData.story,
        recipientName: order.orderData.recipientName,
        recipientRelation: order.orderData.recipientRelation,
        includeNameInSong: order.orderData.includeNameInSong,
        notes: order.orderData.notes,
      });

      order.song1Lyrics = song1Lyrics;
      await this.firebaseService.updateOrder(orderId, { song1Lyrics });

      // Generate music using queue (async) - NO progress update here, queue handles it
      order.status = 'music_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'music_generating' });

      if (this.queueService) {
        // Use async queue for better performance under load
        console.log('🚀 Using queue service for music generation');
        await this.queueService.addMusicGenerationJob({
          orderId,
          phoneNumber: order.whatsappPhone,
          songIndex: 1,
          request: {
            lyrics: song1Lyrics,
            songType: order.orderData.song1.type,
            style: order.orderData.song1.style,
            vocal: order.orderData.song1.vocal,
          },
        });
        // Queue will handle the rest (music generation + delivery)
        return;
      } else {
        // Fallback to sync mode (for development/testing)
        console.log('⚠️ No queue service - using sync mode');
        const song1Task = await this.minimaxService.generateMusic({
          lyrics: song1Lyrics,
          songType: order.orderData.song1.type,
          style: order.orderData.song1.style,
          vocal: order.orderData.song1.vocal,
        });

        const song1Music = await this.minimaxService.waitForTaskCompletion(song1Task.task_id);

        order.song1AudioUrl = song1Music.file_url;
        await this.firebaseService.updateOrder(orderId, {
          song1MusicTaskId: song1Task.task_id,
          song1AudioUrl: song1Music.file_url,
        });

        await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Müzikler hazır!', 70);
      }

      // Generate video if requested
      if (order.orderData.deliveryOptions.video) {
        order.status = 'video_generating';
        await this.firebaseService.updateOrder(orderId, { status: 'video_generating' });
        await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Video oluşturuluyor...', 80);

        const videoPrompt = await this.openaiService.generateVideoPrompt(
          order.orderData.story,
          order.orderData.song1.type
        );

        const videoTask = await this.minimaxService.generateVideo({
          prompt: videoPrompt,
          imageUrl: order.orderData.coverPhoto,
        });

        const videoResult = await this.minimaxService.waitForTaskCompletion(videoTask.task_id);
        order.videoUrl = videoResult.file_url;
        await this.firebaseService.updateOrder(orderId, {
          videoTaskId: videoTask.task_id,
          videoUrl: videoResult.file_url,
        });
      }

      // Complete
      order.status = 'completed';
      order.completedAt = new Date();
      await this.firebaseService.updateOrder(orderId, {
        status: 'completed',
        completedAt: order.completedAt,
      });

      await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Tamamlandı!', 100);
      await this.whatsappService.sendOrderCompletion(order.whatsappPhone, orderId);

      // Log analytics
      await this.firebaseService.logAnalytics('order_completed', {
        orderId,
        phone: order.whatsappPhone,
        totalPrice: order.totalPrice,
      });

      // Deliver files
      await this.deliverOrder(order);

    } catch (error: any) {
      console.error('Error processing order:', error);
      order.status = 'failed';
      order.errorMessage = error.message;
      await this.firebaseService.updateOrder(orderId, {
        status: 'failed',
        errorMessage: error.message,
      });
      await this.whatsappService.sendErrorMessage(order.whatsappPhone, orderId, error.message);
    }
  }

  /**
   * Deliver order
   */
  private async deliverOrder(order: Order): Promise<void> {
    if (order.song1AudioUrl) {
      // Send audio link (sendAudioMessage already includes nice message)
      await this.whatsappService.sendAudioMessage(order.whatsappPhone, order.song1AudioUrl);
    }

    if (order.videoUrl) {
      await this.whatsappService.sendVideoMessage(order.whatsappPhone, order.videoUrl, 'Hediyenizin videosu 🎬');
    }
  }

  /**
   * Helper: Parse music type
   */
  private parseMusicType(input: string): any {
    const types = ['Pop', 'Rap', 'Jazz', 'Arabesk', 'Klasik', 'Rock', 'Metal', 'Nostaljik'];
    const num = parseInt(input);
    return num >= 1 && num <= 8 ? types[num - 1] : null;
  }

  /**
   * Helper: Parse style
   */
  private parseStyle(input: string): any {
    const styles = ['Romantik', 'Duygusal', 'Eğlenceli', 'Sakin'];
    const num = parseInt(input);
    return num >= 1 && num <= 4 ? styles[num - 1] : null;
  }

  /**
   * Helper: Parse vocal
   */
  private parseVocal(input: string): any {
    const vocals = ['Kadın', 'Erkek', 'Fark etmez'];
    const num = parseInt(input);
    return num >= 1 && num <= 3 ? vocals[num - 1] : null;
  }

  /**
   * Helper: Parse delivery option
   */
  private parseDeliveryOption(input: string): any {
    const num = parseInt(input);
    switch (num) {
      case 1:
        return { audioFile: true, musicPlatform: false, video: false };
      case 2:
        return { audioFile: true, musicPlatform: true, video: false };
      case 3:
        return { audioFile: true, musicPlatform: false, video: true };
      case 4:
        return { audioFile: true, musicPlatform: true, video: true };
      default:
        return null;
    }
  }

  /**
   * Helper: Calculate price
   */
  private calculatePrice(options: any): number {
    return 350; // Fixed price for 1 song (audio only)
  }

  /**
   * Helper: Calculate price details
   */
  private calculatePriceDetails(options: any): any {
    const basePrice = 350;
    return {
      basePrice,
      additionalCosts: 0,
      totalPrice: basePrice,
    };
  }

  /**
   * Send help message
   */
  private async sendHelpMessage(from: string): Promise<void> {
    await this.whatsappService.sendTextMessage(
      from,
      `📚 *Yardım*

Komutlar:
• "merhaba" - Yeni sipariş başlat
• "iptal" - Mevcut siparişi iptal et
• "yardim" - Bu mesajı göster

Destek: support@bihediye.art`
    );
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    return await this.firebaseService.getOrder(orderId);
  }

  /**
   * Get all orders
   */
  async getAllOrders(): Promise<Order[]> {
    return await this.firebaseService.getAllOrders();
  }

  /**
   * Get orders by phone
   */
  async getOrdersByPhone(phone: string): Promise<Order[]> {
    return await this.firebaseService.getOrdersByPhone(phone);
  }

  /**
   * Get all active conversations
   */
  async getAllConversations(): Promise<ConversationState[]> {
    return await this.firebaseService.getAllConversations();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    return await this.firebaseService.getStats();
  }
}
