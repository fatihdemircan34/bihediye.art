import { v4 as uuidv4 } from 'uuid';
import { Order, OrderRequest } from '../models/order.model';
import { MinimaxService } from './minimax.service';
import { OpenAIService } from './openai.service';
import { WhatsAppService } from './whatsapp.service';
import { FirebaseService } from './firebase.service';
import { FirebaseQueueService } from './firebase-queue.service';
import { PaytrService } from './paytr.service';
import { DiscountService } from './discount.service';
import { AIConversationService } from './ai-conversation.service';
import { config } from '../config/config';

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
    | 'discount_code'
    | 'confirm'
    | 'processing';
  data: Partial<OrderRequest>;
  discountCode?: string;
  discountAmount?: number;
  finalPrice?: number;
  lastUpdated: Date;
}

export class OrderService {
  private queueService?: FirebaseQueueService;
  private paytrService?: PaytrService;
  private discountService: DiscountService;
  private aiConversationService: AIConversationService;

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
    this.discountService = new DiscountService(firebaseService);
    this.aiConversationService = new AIConversationService(openaiService);
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

      // Log analytics: conversation started
      await this.firebaseService.logAnalytics('conversation_started', {
        phone: from,
        timestamp: new Date().toISOString(),
      });
    }

    // Update last activity
    conversation.lastUpdated = new Date();

    // Handle special commands
    if (message.toLowerCase() === 'iptal' || message.toLowerCase() === 'cancel') {
      // Log analytics: conversation abandoned
      await this.firebaseService.logAnalytics('conversation_abandoned', {
        phone: from,
        step: conversation.step,
        timestamp: new Date().toISOString(),
      });

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
          `🎵 *Merhaba! bihediye.art'a hoş geldiniz!*

Sevdiklerinize yapay zeka ile hazırlanan özel bir şarkı hediye etmek ister misiniz? 🎁

💰 Sadece ${config.pricing.songBasePrice} TL karşılığında, hikayenizden ilham alan, 2 dakikadan uzun, profesyonel bir şarkı hazırlıyoruz!

✨ *Nasıl bir şarkı düşünüyorsunuz?*

Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal veya Nostaljik türlerinden birini seçebilirsiniz. İstediğiniz türü yazmanız yeterli!

Örneğin: "Pop müzik istiyorum" veya sadece "Rap" yazabilirsiniz 😊

_İstediğiniz zaman "iptal" yazarak vazgeçebilirsiniz_`
        );
        conversation.step = 'song1_type';
        break;

      case 'song1_type':
        const songTypeResult = await this.aiConversationService.parseSongType(message);

        if (!songTypeResult.type) {
          // User didn't select a type or needs help
          await this.whatsappService.sendTextMessage(from, songTypeResult.response);
          return;
        }

        conversation.data.song1 = { type: songTypeResult.type } as any;

        // Log analytics: song type selected
        await this.firebaseService.logAnalytics('song_type_selected', {
          phone: from,
          songType: songTypeResult.type,
          timestamp: new Date().toISOString(),
        });

        await this.whatsappService.sendTextMessage(
          from,
          `${songTypeResult.response}

✨ *Şarkının tarzını belirleyelim mi?*

Romantik, Duygusal, Eğlenceli veya Sakin tarzlarından hangisini istersiniz?

İstediğinizi yazabilirsiniz! 😊`
        );
        conversation.step = 'song1_style';
        break;

      case 'song1_style':
        const songStyleResult = await this.aiConversationService.parseSongStyle(message, conversation.data.song1!.type);

        if (!songStyleResult.style) {
          await this.whatsappService.sendTextMessage(from, songStyleResult.response);
          return;
        }

        conversation.data.song1!.style = songStyleResult.style;

        // Log analytics: song style selected
        await this.firebaseService.logAnalytics('song_style_selected', {
          phone: from,
          songStyle: songStyleResult.style,
          songType: conversation.data.song1?.type,
          timestamp: new Date().toISOString(),
        });

        await this.whatsappService.sendTextMessage(
          from,
          `${songStyleResult.response}

🎤 *Şarkıyı hangi seste dinlemek istersiniz?*

Kadın sesi mi, Erkek sesi mi yoksa Fark etmez mi?`
        );
        conversation.step = 'song1_vocal';
        break;

      case 'song1_vocal':
        const vocalResult = await this.aiConversationService.parseVocal(message);

        if (!vocalResult.vocal) {
          await this.whatsappService.sendTextMessage(from, vocalResult.response);
          return;
        }

        conversation.data.song1!.vocal = vocalResult.vocal;
        await this.whatsappService.sendTextMessage(
          from,
          `${vocalResult.response}

🎁 *Harika! Şarkı ayarları tamamlandı.*

Şimdi biraz daha kişiselleştirelim... Bu şarkıyı hediye edeceğiniz kişi sizin neyiniz?

Örneğin: "Annem", "Sevgilim", "En yakın arkadaşım" gibi...`
        );
        conversation.step = 'recipient_relation';
        break;

      case 'recipient_relation':
        const relationResult = await this.aiConversationService.parseRecipientRelation(message);

        if (!relationResult.relation) {
          await this.whatsappService.sendTextMessage(from, relationResult.response);
          return;
        }

        conversation.data.recipientRelation = relationResult.relation;
        await this.whatsappService.sendTextMessage(
          from,
          `${relationResult.response}

💝 *Şarkıda hediye edeceğiniz kişinin ismi geçsin mi?*

"Evet" veya "Hayır" diyebilirsiniz.`
        );
        conversation.step = 'name_in_song';
        break;

      case 'name_in_song':
        const nameInSongResult = await this.aiConversationService.parseNameInSong(message);

        if (nameInSongResult.answer === null) {
          await this.whatsappService.sendTextMessage(from, nameInSongResult.response);
          return;
        }

        if (nameInSongResult.answer === true) {
          conversation.data.includeNameInSong = true;
          await this.whatsappService.sendTextMessage(
            from,
            `${nameInSongResult.response}

📝 *Hediye edeceğiniz kişinin adı nedir?*

İsmini yazabilirsiniz:`
          );
          conversation.step = 'recipient_name';
        } else {
          conversation.data.includeNameInSong = false;
          await this.whatsappService.sendTextMessage(
            from,
            `${nameInSongResult.response}

📖 *Şimdi sıra hikayenizde!*

Şarkıda geçmesini istediğiniz duyguları, anıları, hikayenizi yazın... Ne kadar samimi olursanız, şarkı o kadar özel olacak! 💝

(En az birkaç cümle yazın, maksimum 900 karakter)`
          );
          conversation.step = 'story';
        }
        break;

      case 'recipient_name':
        const recipientNameResult = await this.aiConversationService.parseRecipientName(message);

        if (!recipientNameResult.name) {
          await this.whatsappService.sendTextMessage(from, recipientNameResult.response);
          return;
        }

        conversation.data.recipientName = recipientNameResult.name;
        await this.whatsappService.sendTextMessage(
          from,
          `${recipientNameResult.response}

📖 *Şimdi sıra hikayenizde!*

${recipientNameResult.name} için özel bir şarkı hazırlıyoruz... Şarkıda geçmesini istediğiniz duyguları, anıları, hikayenizi yazın. Ne kadar samimi olursanız, şarkı o kadar özel olacak! 💝

(En az birkaç cümle yazın, maksimum 900 karakter)`
        );
        conversation.step = 'story';
        break;

      case 'story':
        const storyValidation = await this.aiConversationService.validateStory(message);

        if (!storyValidation.isValid) {
          await this.whatsappService.sendTextMessage(from, storyValidation.response);
          return;
        }

        conversation.data.story = message;
        await this.whatsappService.sendTextMessage(
          from,
          `${storyValidation.response}

📝 *Son bir soru: Ek notlarınız var mı?*

Şarkı ile ilgili özellikle belirtmek istediğiniz bir şey varsa yazabilirsiniz. (Maksimum 300 karakter)

Yoksa "hayır" veya "yok" yazabilirsiniz.`
        );
        conversation.step = 'notes';
        break;

      case 'notes':
        const notesResult = await this.aiConversationService.parseNotes(message);

        if (notesResult.hasNotes && !notesResult.notes) {
          // Note is too long
          await this.whatsappService.sendTextMessage(from, notesResult.response);
          return;
        }

        if (notesResult.hasNotes && notesResult.notes) {
          conversation.data.notes = notesResult.notes;
        }

        // Directly set delivery options (audio only)
        conversation.data.deliveryOptions = {
          audioFile: true,
          musicPlatform: false,
          video: false
        };

        // Ask for discount code
        await this.whatsappService.sendTextMessage(
          from,
          `${notesResult.response}

🎁 *İndirim Kodunuz Var Mı?*

Eğer bir indirim kodunuz varsa şimdi girebilirsiniz.

Yoksa "hayır" veya "yok" yazabilirsiniz.`
        );
        conversation.step = 'discount_code';
        break;

      case 'discount_code':
        const messageLower = message.toLowerCase().trim();

        // Check if user doesn't have a discount code
        if (messageLower === 'hayır' || messageLower === 'yok' || messageLower === 'hayir') {
          await this.sendOrderConfirmation(conversation);
          break;
        }

        // Try to apply discount code
        const basePrice = this.calculatePrice(conversation.data.deliveryOptions!);
        const discountResult = await this.discountService.validateAndApplyDiscount(
          message.trim().toUpperCase(),
          from,
          basePrice
        );

        if (discountResult.isValid && discountResult.discountCode) {
          // Save discount info to conversation
          conversation.discountCode = discountResult.discountCode.code;
          conversation.discountAmount = discountResult.discountAmount;
          conversation.finalPrice = discountResult.finalPrice;

          await this.whatsappService.sendTextMessage(from, discountResult.message);
          await this.sendOrderConfirmation(conversation);
        } else {
          // Invalid code - ask again
          await this.whatsappService.sendTextMessage(
            from,
            `${discountResult.message}

Başka bir kod denemek isterseniz yazabilirsiniz, yoksa "yok" yazın.`
          );
          // Stay on discount_code step
        }
        break;

      case 'confirm':
        const confirmResult = await this.aiConversationService.parseConfirmation(message);

        if (confirmResult.confirmed === null) {
          await this.whatsappService.sendTextMessage(from, confirmResult.response);
          return;
        }

        if (confirmResult.confirmed === true) {
          // Log analytics: conversation completed
          await this.firebaseService.logAnalytics('conversation_completed', {
            phone: from,
            songType: conversation.data.song1?.type,
            songStyle: conversation.data.song1?.style,
            timestamp: new Date().toISOString(),
          });

          await this.whatsappService.sendTextMessage(from, confirmResult.response);
          await this.createOrderAndSendPaymentLink(conversation);
        } else {
          // Log analytics: order cancelled at confirm step
          await this.firebaseService.logAnalytics('conversation_abandoned', {
            phone: from,
            step: 'confirm',
            reason: 'user_cancelled',
            timestamp: new Date().toISOString(),
          });

          await this.firebaseService.deleteConversation(from);
          await this.whatsappService.sendTextMessage(from, confirmResult.response);
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
    // Always use config base price (not calculated from conversation)
    const basePrice = config.pricing.songBasePrice;
    const finalPrice = conversation.finalPrice || basePrice;
    const discountAmount = conversation.discountAmount || 0;

    let pricingText = '';
    if (discountAmount > 0) {
      pricingText = `💰 *Fiyat: ${basePrice} TL*
🎁 *İndirim: -${discountAmount} TL* (${conversation.discountCode})
✨ *Toplam: ${finalPrice} TL*`;
    } else {
      pricingText = `💰 *Toplam: ${finalPrice} TL*`;
    }

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

${pricingText}

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
      const orderId = uuidv4().replace(/-/g, ''); // Remove hyphens for PayTR compatibility
      const orderRequest: OrderRequest = conversation.data as OrderRequest;
      orderRequest.phone = conversation.phone;

      const pricing = this.calculatePriceDetails(orderRequest.deliveryOptions);
      const finalPrice = conversation.finalPrice || pricing.totalPrice;
      const discountAmount = conversation.discountAmount || 0;

      const order: Order = {
        id: orderId,
        whatsappPhone: conversation.phone,
        orderData: orderRequest,
        status: 'payment_pending', // Ödeme bekliyor
        basePrice: pricing.basePrice,
        additionalCosts: pricing.additionalCosts,
        totalPrice: finalPrice,
        discountCode: conversation.discountCode,
        discountAmount: discountAmount,
        createdAt: new Date(),
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      // Save order to Firebase
      await this.firebaseService.saveOrder(order);

      // Record discount usage if applied
      if (conversation.discountCode && discountAmount > 0) {
        const discountCodes = await this.discountService.getAllDiscountCodes();
        const discountCodeObj = discountCodes.find(d => d.code === conversation.discountCode);
        if (discountCodeObj) {
          await this.discountService.recordDiscountUsage(
            discountCodeObj.id,
            orderId,
            conversation.phone,
            discountAmount,
            pricing.totalPrice,
            finalPrice
          );
          console.log(`✅ Discount code ${conversation.discountCode} applied to order ${orderId}`);
        }
      }

      conversation.step = 'processing';
      await this.firebaseService.saveConversation(conversation);

      // Log analytics
      await this.firebaseService.logAnalytics('order_created', {
        orderId,
        phone: conversation.phone,
        totalPrice: order.totalPrice,
      });

      // Check if order is free (0 TL) - skip payment
      if (order.totalPrice === 0) {
        console.log(`🎁 Free order detected (100% discount) - skipping payment for ${orderId}`);

        // Mark as paid immediately
        await this.firebaseService.updateOrder(orderId, {
          status: 'paid',
          paidAt: new Date(),
        });

        // Send confirmation
        await this.whatsappService.sendTextMessage(
          conversation.phone,
          `🎉 *Siparişiniz Onaylandı!*

🎵 Sipariş No: ${orderId}
💰 Tutar: 0 TL (Hediyemiz olsun! 🎁)

Şarkınızın hazırlanmasına başlıyoruz! 2 saat içinde teslim edilecek.

Teşekkür ederiz! ❤️`
        );

        // Start processing immediately
        await this.handlePaymentSuccess(orderId);

        return;
      }

      // Generate payment link and send
      if (this.paytrService) {
        await this.sendPaymentLink(order);
      } else {
        // PayTR not configured - inform user
        console.error('❌ PayTR service not configured - cannot process payment');
        await this.whatsappService.sendTextMessage(
          conversation.phone,
          `❌ *Ödeme Sistemi Aktif Değil*

Şu anda ödeme altyapımız yapılandırılmamış durumda.

Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin:
📧 support@bihediye.art

Sipariş numaranız: ${orderId}`
        );

        // Cancel the order
        await this.firebaseService.updateOrder(orderId, {
          status: 'failed',
          errorMessage: 'Payment system not configured',
        });
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

      const baseUrl = process.env.BASE_URL || 'https://bihediye.art';

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

        // Log analytics: payment link sent
        await this.firebaseService.logAnalytics('payment_link_sent', {
          orderId: order.id,
          phone: order.whatsappPhone,
          amount: order.totalPrice,
          timestamp: new Date().toISOString(),
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

      // Log analytics: payment completed
      await this.firebaseService.logAnalytics('payment_completed', {
        orderId,
        phone: order.whatsappPhone,
        amount: order.totalPrice,
        timestamp: new Date().toISOString(),
      });

      // Send confirmation
      await this.whatsappService.sendOrderConfirmation(
        order.whatsappPhone,
        orderId,
        order.totalPrice,
        order.estimatedDelivery|| new Date(),
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
      const orderId = uuidv4().replace(/-/g, ''); // Remove hyphens for PayTR compatibility
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
        order.estimatedDelivery || new Date(),
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

      // Log analytics: lyrics generation started
      await this.firebaseService.logAnalytics('lyrics_generation_started', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        timestamp: new Date().toISOString(),
      });

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

      // Log analytics: music generation started
      await this.firebaseService.logAnalytics('music_generation_started', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        timestamp: new Date().toISOString(),
      });

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

      // Log analytics: order delivered
      await this.firebaseService.logAnalytics('order_delivered', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        timestamp: new Date().toISOString(),
      });

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
    return config.pricing.songBasePrice; // Base price for 1 song (audio only)
  }

  /**
   * Helper: Calculate price details
   */
  private calculatePriceDetails(options: any): any {
    const basePrice = config.pricing.songBasePrice;
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
