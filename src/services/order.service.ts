import { v4 as uuidv4 } from 'uuid';
import { Order, OrderRequest } from '../models/order.model';
import { SunoService } from './suno.service';
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
    | 'song_settings'      // Combined: type + style + vocal
    | 'recipient_info'      // Combined: relation + name
    | 'story_and_notes'     // Combined: story + notes
    | 'confirm'             // Includes discount code
    | 'lyrics_review_song1'
    | 'processing';
  data: Partial<OrderRequest>;
  discountCode?: string;
  discountAmount?: number;
  finalPrice?: number;
  lastUpdated: Date;
  tempLyrics?: string;
  lyricsRevisionCount?: number;
  retryCount?: number;  // Track failed parse attempts per step
  lastMessage?: string; // Track last user message to detect duplicates
  duplicateCount?: number; // Count duplicate messages
  waitingForCustomLyrics?: boolean; // User chose to write their own lyrics
}

export class OrderService {
  private queueService?: FirebaseQueueService;
  private paytrService?: PaytrService;
  private discountService: DiscountService;
  private aiConversationService: AIConversationService;

  constructor(
    private sunoService: SunoService,
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

    // Check if user says "merhaba" - reset conversation
    const isGreeting = message.toLowerCase().trim() === 'merhaba' ||
                       message.toLowerCase().trim() === 'hello' ||
                       message.toLowerCase().trim() === 'hi';

    if (!conversation || isGreeting) {
      // If greeting and conversation exists, delete old one first
      if (conversation && isGreeting) {
        await this.firebaseService.deleteConversation(from);
        console.log(`🔄 Old conversation deleted for ${from}, starting fresh`);
      }

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

    // Handle special commands (Turkish-aware lowercase)
    const messageLower = message.trim().toLocaleLowerCase('tr-TR');
    if (messageLower === 'iptal' || messageLower === 'cancel') {
      // Check if payment already made (lyrics_review or processing step)
      if (conversation.step === 'lyrics_review_song1' || conversation.step === 'processing') {
        await this.whatsappService.sendTextMessage(
          from,
          `⚠️ *Ödeme tamamlandıktan sonra iptal yapılamaz.*

Herhangi bir sorun için lütfen iletişime geçin:
📧 destek@bihediye.art

Siparişiniz işleme devam ediyor...`
        );
        return;
      }

      // Log analytics: conversation abandoned (before payment)
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
    const shouldSaveConversation = await this.processConversationStep(conversation, message);

    // Save conversation state to Firebase (unless processing step returned false)
    if (shouldSaveConversation !== false) {
      await this.firebaseService.saveConversation(conversation);
    }
  }

  /**
   * Process conversation step
   * Returns false if conversation should NOT be saved (e.g., processing step)
   */
  private async processConversationStep(conversation: ConversationState, message: string): Promise<boolean | void> {
    const from = conversation.phone;

    // Detect duplicate messages
    if (conversation.lastMessage === message) {
      conversation.duplicateCount = (conversation.duplicateCount || 0) + 1;

      // After 2 duplicate messages, treat as retry failure
      if (conversation.duplicateCount >= 2) {
        console.log(`⚠️ Duplicate message detected ${conversation.duplicateCount} times: "${message}"`);
        conversation.retryCount = (conversation.retryCount || 0) + 2; // Force fallback
        conversation.duplicateCount = 0; // Reset
      }
    } else {
      // New message, reset duplicate counter
      conversation.lastMessage = message;
      conversation.duplicateCount = 0;
    }

    switch (conversation.step) {
      case 'welcome':
        await this.whatsappService.sendTextMessage(
          from,
          `🎵 *bihediye.art'a hoş geldiniz!*

Sevdiklerinize yapay zeka ile özel şarkı hediye edin! 💝

💰 ${config.pricing.songBasePrice} TL | ⏱️ 2 saat teslimat

*📝 İKİ YÖNTEM:*

*1️⃣ TEK MESAJDA HER ŞEYİ YAZIN:*
Örnek: "Annem için Pop tarzında Romantik bir şarkı, Kadın sesi olsun. İsmini geçsin, adı Ayşe. 30 yıldır bize fedakarlıkla baktı, her zaman yanımızda oldu..."

*2️⃣ ADIM ADIM İLERLEYELİM:*
🎵 Tür: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik
🎭 Tarz: Romantik, Duygusal, Eğlenceli, Sakin
🎤 Vokal: Kadın, Erkek, Fark etmez

---
💡 İptal: *"iptal"* yazın`
        );
        conversation.step = 'song_settings';
        break;

      case 'song_settings':
        // CRITICAL: Ensure conversation.data exists
        if (!conversation.data) {
          conversation.data = {};
        }

        // Ensure song1 is initialized before accessing it
        const existingSongData = (conversation.data.song1 || {}) as any;

        // Pass existing song data to avoid re-asking for already collected info
        const settingsResult = await this.aiConversationService.parseSongSettings(
          message,
          existingSongData
        );

        // PROGRESSIVE: Update conversation with collected data (even if partial)
        conversation.data.song1 = {
          type: settingsResult.type || existingSongData.type,
          style: settingsResult.style || existingSongData.style,
          vocal: settingsResult.vocal || existingSongData.vocal,
          artistStyleDescription: settingsResult.artistStyleDescription || existingSongData.artistStyleDescription,
        } as any;

        console.log('💾 Updated conversation.data.song1:', conversation.data.song1);

        // Check if ALL required fields are NOW present
        const currentSongData = (conversation.data.song1 || {}) as any;
        if (!currentSongData.type || !currentSongData.style || !currentSongData.vocal) {
          // Increment retry counter
          conversation.retryCount = (conversation.retryCount || 0) + 1;

          // After 2 failed attempts, use random defaults
          if (conversation.retryCount >= 2) {
            conversation.data.song1 = {
              type: currentSongData.type || 'Pop',
              style: currentSongData.style || 'Eğlenceli',
              vocal: currentSongData.vocal || 'Fark etmez',
              artistStyleDescription: currentSongData.artistStyleDescription,
            } as any;
            conversation.retryCount = 0; // Reset counter

            await this.whatsappService.sendTextMessage(
              from,
              `Üzgünüm, tam anlamadım 😊 Devam edebilmek için ${conversation.data.song1?.type || 'Pop'}, ${conversation.data.song1?.style || 'Eğlenceli'}, ${conversation.data.song1?.vocal || 'Fark etmez'} seçiyorum.`
            );
            // Continue to next step (don't return)
          } else {
            // Still missing info - send AI's response asking for missing fields
            await this.whatsappService.sendTextMessage(from, settingsResult.response);
            return; // Stay on same step, but conversation is saved with partial data
          }
        } else {
          // Reset retry counter on success
          conversation.retryCount = 0;
        }

        // All settings collected!

        // Log analytics
        await this.firebaseService.logAnalytics('song_settings_completed', {
          phone: from,
          songType: conversation.data.song1.type,
          songStyle: conversation.data.song1.style,
          vocal: conversation.data.song1.vocal,
          hasArtistStyle: !!conversation.data.song1.artistStyleDescription,
          timestamp: new Date().toISOString(),
        });

        // Next: recipient info
        await this.whatsappService.sendTextMessage(
          from,
          `💝 *Hediye Bilgileri:*

Bu kişi sizin neyiniz? (Annem, Sevgilim, vb.)
Şarkıda ismini geçirmek ister misiniz? (Evet/Hayır)
İsmi nedir? (Geçecekse)

Örnek: "Annem, Evet, Fatma"

---
💡 İptal etmek için *"iptal"* yazın.`
        );
        conversation.step = 'recipient_info';
        break;

      case 'recipient_info':
        // CRITICAL: Ensure conversation.data exists
        if (!conversation.data) {
          conversation.data = {};
        }

        // PROGRESSIVE: Pass existing recipient data to avoid re-asking
        const existingRecipient = {
          relation: conversation.data.recipientRelation,
          includeNameInSong: conversation.data.includeNameInSong,
          name: conversation.data.recipientName,
        };

        const recipientResult = await this.aiConversationService.parseRecipientInfo(
          message,
          existingRecipient
        );

        // PROGRESSIVE: Update conversation with collected data (even if partial)
        conversation.data.recipientRelation = recipientResult.relation || conversation.data.recipientRelation;
        conversation.data.includeNameInSong = recipientResult.includeNameInSong ?? conversation.data.includeNameInSong;
        conversation.data.recipientName = recipientResult.name || conversation.data.recipientName;

        console.log('💾 Updated conversation recipient data:', {
          relation: conversation.data.recipientRelation,
          includeNameInSong: conversation.data.includeNameInSong,
          name: conversation.data.recipientName,
        });

        // Check if ALL required fields are NOW present
        if (!conversation.data.recipientRelation || conversation.data.includeNameInSong === null || conversation.data.includeNameInSong === undefined) {
          // Increment retry counter
          conversation.retryCount = (conversation.retryCount || 0) + 1;

          // After 2 failed attempts, use random defaults
          if (conversation.retryCount >= 2) {
            const randomRelations = ['Annem', 'Sevgilim', 'Arkadaşım', 'Ailem'];
            const randomRelation = randomRelations[Math.floor(Math.random() * randomRelations.length)];

            conversation.data.recipientRelation = randomRelation;
            conversation.data.includeNameInSong = false;
            conversation.retryCount = 0; // Reset counter

            await this.whatsappService.sendTextMessage(
              from,
              `Üzgünüm, tam anlamadım 😊 Devam edebilmek için "${randomRelation}" seçiyorum ve isim kullanmadan devam ediyorum.`
            );
            // Continue to next step (don't return)
          } else {
            await this.whatsappService.sendTextMessage(from, recipientResult.response);
            return; // Stay on same step, but conversation is saved with partial data
          }
        } else {
          // If name should be included but not provided, ask again
          if (conversation.data.includeNameInSong && !conversation.data.recipientName) {
            conversation.retryCount = (conversation.retryCount || 0) + 1;

            if (conversation.retryCount >= 2) {
              // Use a default name
              conversation.data.recipientName = 'Sevgili';
              conversation.retryCount = 0;

              await this.whatsappService.sendTextMessage(
                from,
                `İsmi anlayamadım, "Sevgili" olarak devam ediyorum 😊`
              );
              // Continue to next step
            } else {
              await this.whatsappService.sendTextMessage(from, recipientResult.response);
              return;
            }
          }

          // Reset retry counter on success
          conversation.retryCount = 0;
        }

        // Log analytics
        await this.firebaseService.logAnalytics('recipient_info_completed', {
          phone: from,
          relation: recipientResult.relation,
          includeNameInSong: recipientResult.includeNameInSong,
          timestamp: new Date().toISOString(),
        });

        // Next: story and notes
        await this.whatsappService.sendTextMessage(
          from,
          `📖 *Hikayenizi Anlatın:*

Şarkıda geçmesini istediğiniz duyguları, anıları, hikayenizi yazın.

💡 Varsa özel isteklerinizi de ekleyebilirsiniz (tempo, stil, vb.)

Örnek:
"10 yıldır evliyiz, her zorluğu birlikte atlattık...

Not: Slow tempo olsun"

---
💡 İptal etmek için *"iptal"* yazın.`
        );
        conversation.step = 'story_and_notes';
        break;

      case 'story_and_notes':
        // CRITICAL: Ensure conversation.data exists
        if (!conversation.data) {
          conversation.data = {};
        }

        const storyResult = await this.aiConversationService.parseStoryAndNotes(message);

        if (!storyResult.story) {
          await this.whatsappService.sendTextMessage(from, storyResult.response);
          return;
        }

        // Save story and notes
        conversation.data.story = storyResult.story;
        if (storyResult.notes) {
          conversation.data.notes = storyResult.notes;
        }

        // Set delivery options (audio only)
        conversation.data.deliveryOptions = {
          audioFile: true,
          musicPlatform: false,
          video: false
        };

        // Log analytics
        await this.firebaseService.logAnalytics('story_completed', {
          phone: from,
          hasNotes: !!storyResult.notes,
          timestamp: new Date().toISOString(),
        });

        // Show order confirmation (includes discount code option)
        await this.sendOrderConfirmation(conversation);
        break;

      case 'confirm':
        // Handle discount code OR confirmation
        const messageLower = message.toLowerCase().trim();

        // Check if user is trying to apply discount code
        if (messageLower !== 'evet' && messageLower !== 'hayır' && messageLower !== '1' && messageLower !== '2'
            && messageLower !== 'onayla' && messageLower !== 'iptal' && !conversation.discountCode) {
          // Try to apply discount code
          const basePrice = this.calculatePrice(conversation.data.deliveryOptions!);
          const discountResult = await this.discountService.validateAndApplyDiscount(
            message.trim().toUpperCase(),
            from,
            basePrice
          );

          if (discountResult.isValid && discountResult.discountCode) {
            // Save discount and show updated confirmation
            conversation.discountCode = discountResult.discountCode.code;
            conversation.discountAmount = discountResult.discountAmount;
            conversation.finalPrice = discountResult.finalPrice;

            await this.whatsappService.sendTextMessage(from, `${discountResult.message}

Güncellenmiş sipariş özeti:`);
            await this.sendOrderConfirmation(conversation);
            return;
          } else {
            // Invalid code - show error and ask for confirmation
            await this.whatsappService.sendTextMessage(
              from,
              `${discountResult.message}

Yine de devam etmek ister misiniz?
1️⃣ Evet
2️⃣ Hayır`
            );
            return;
          }
        }

        // Parse confirmation
        const confirmResult = await this.aiConversationService.parseConfirmation(message);

        if (confirmResult.confirmed === null) {
          await this.whatsappService.sendTextMessage(from, confirmResult.response);
          return;
        }

        if (confirmResult.confirmed === true) {
          // Log analytics
          await this.firebaseService.logAnalytics('conversation_completed', {
            phone: from,
            songType: conversation.data.song1?.type,
            songStyle: conversation.data.song1?.style,
            hasDiscount: !!conversation.discountCode,
            timestamp: new Date().toISOString(),
          });

          await this.createOrderAndSendPaymentLink(conversation);
        } else {
          // Cancelled
          await this.firebaseService.logAnalytics('conversation_abandoned', {
            phone: from,
            step: 'confirm',
            reason: 'user_cancelled',
            timestamp: new Date().toISOString(),
          });

          await this.firebaseService.deleteConversation(from);
          await this.whatsappService.sendTextMessage(from, '❌ Sipariş iptal edildi. Yeni sipariş için "merhaba" yazın.');
        }
        break;

      case 'lyrics_review_song1':
        // Check if we're waiting for custom lyrics from user
        if (conversation.waitingForCustomLyrics) {
          const orders = await this.firebaseService.getOrdersByPhone(from);
          const pendingOrder = orders.find(o => o.status === 'lyrics_generating' || o.status === 'paid');

          if (pendingOrder) {
            // Check if user wrote lyrics with Suno AI format headers
            const hasSunoFormat = /\[(Intro|Verse|Chorus|Bridge|Pre-Chorus|Outro|Instrumental Break)\]/i.test(message);

            let finalLyrics = message;

            if (!hasSunoFormat) {
              // User didn't use format - let OpenAI format it
              await this.whatsappService.sendTextMessage(from, '⏳ Sözlerinizi Suno AI formatına çeviriyoruz...');

              try {
                const formatResult = await this.openaiService.formatUserLyrics(message);
                finalLyrics = formatResult.lyrics;

                // Log token usage
                if (formatResult.tokenUsage) {
                  await this.firebaseService.logAnalytics('openai_token_usage', {
                    orderId: pendingOrder.id,
                    phone: pendingOrder.whatsappPhone,
                    operation: 'format_user_lyrics',
                    promptTokens: formatResult.tokenUsage.promptTokens,
                    completionTokens: formatResult.tokenUsage.completionTokens,
                    totalTokens: formatResult.tokenUsage.totalTokens,
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (error: any) {
                console.error('Error formatting user lyrics:', error);
                await this.whatsappService.sendTextMessage(
                  from,
                  `❌ Sözlerinizi formatlarken hata oluştu: ${error.message}\n\nLütfen tekrar deneyin veya başka sözler gönderin.`
                );
                return;
              }
            }

            // Update order with custom lyrics
            await this.firebaseService.updateOrder(pendingOrder.id, {
              song1Lyrics: finalLyrics,
            });

            // Send confirmation and start music generation
            await this.whatsappService.sendTextMessage(
              from,
              `✅ *Şarkı Sözleri Alındı!*

${finalLyrics}

---

Müzik üretimine başlıyoruz! 🎵`
            );

            conversation.waitingForCustomLyrics = false;
            await this.firebaseService.deleteConversation(from);
            await this.startMusicGeneration(pendingOrder.id);
          }
          return;
        }

        // User is reviewing lyrics after payment
        const reviewResult = await this.aiConversationService.parseLyricsReview(message);

        if (!reviewResult.action) {
          await this.whatsappService.sendTextMessage(from, reviewResult.response);
          return;
        }

        if (reviewResult.action === 'approve') {
          // User approved - start music generation
          await this.whatsappService.sendTextMessage(from, reviewResult.response);

          // Find order by phone
          const orders = await this.firebaseService.getOrdersByPhone(from);
          const pendingOrder = orders.find(o => o.status === 'lyrics_generating' || o.status === 'paid');

          if (pendingOrder) {
            // IMPORTANT: Delete conversation BEFORE starting music generation
            // This resets user state to initial (allows new orders)
            await this.firebaseService.deleteConversation(from);

            // Start music generation directly (lyrics already generated and approved)
            await this.startMusicGeneration(pendingOrder.id);
          }
        } else if (reviewResult.action === 'revise') {
          // User wants revision
          const revisionCount = conversation.lyricsRevisionCount || 0;

          if (revisionCount >= 2) {
            // Max revisions reached
            await this.whatsappService.sendTextMessage(
              from,
              `❌ Revizyon hakkınız dolmuştur (2/2).

Şarkı sözleri mevcut haliyle onaylandı. Müzik üretimine geçiyoruz... 🎵`
            );

            const orders = await this.firebaseService.getOrdersByPhone(from);
            const pendingOrder = orders.find(o => o.status === 'lyrics_generating' || o.status === 'paid');

            if (pendingOrder) {
              // Delete conversation first (reset user state)
              await this.firebaseService.deleteConversation(from);

              // Start music generation directly (lyrics already exist and approved)
              await this.startMusicGeneration(pendingOrder.id);
            }
          } else {
            // Process revision
            await this.whatsappService.sendTextMessage(from, `${reviewResult.response} ⏳`);

            const orders = await this.firebaseService.getOrdersByPhone(from);
            const pendingOrder = orders.find(o => o.status === 'lyrics_generating' || o.status === 'paid');

            if (pendingOrder && reviewResult.revisionRequest) {
              // Revise lyrics
              const revisionResult = await this.openaiService.reviseLyrics(
                conversation.tempLyrics!,
                reviewResult.revisionRequest
              );

              // Log token usage
              if (revisionResult.tokenUsage) {
                await this.firebaseService.logAnalytics('openai_token_usage', {
                  orderId: pendingOrder.id,
                  phone: pendingOrder.whatsappPhone,
                  operation: 'lyrics_revision',
                  revisionNumber: revisionCount + 1,
                  promptTokens: revisionResult.tokenUsage.promptTokens,
                  completionTokens: revisionResult.tokenUsage.completionTokens,
                  totalTokens: revisionResult.tokenUsage.totalTokens,
                  timestamp: new Date().toISOString(),
                });
              }

              // Update conversation
              conversation.tempLyrics = revisionResult.lyrics;
              conversation.lyricsRevisionCount = revisionCount + 1;
              await this.firebaseService.saveConversation(conversation);

              // Update order
              await this.firebaseService.updateOrder(pendingOrder.id, {
                song1Lyrics: revisionResult.lyrics,
                song1LyricsRevisionCount: revisionCount + 1,
              });

              // Send revised lyrics
              const remainingRevisions = 2 - (revisionCount + 1);
              await this.whatsappService.sendTextMessage(
                from,
                `📝 *Revize Edilmiş Şarkı Sözleri:*

${revisionResult.lyrics}

---

✨ *Kalan revizyon hakkınız: ${remainingRevisions}/2*

Ne yapmak istersiniz?
1️⃣ Onayla (Müzik üretimine geç)
2️⃣ ${remainingRevisions > 0 ? 'Tekrar Revize Et' : 'Revizyon hakkınız bitti'}
3️⃣ Komple Ben Yazacağım (Suno AI formatında kendi sözlerinizi gönderin)

---
💡 Destek: destek@bihediye.art`
              );
            }
          }
        } else if (reviewResult.action === 'write_own') {
          // User wants to write their own lyrics
          await this.whatsappService.sendTextMessage(from, reviewResult.response);
          conversation.waitingForCustomLyrics = true;
          await this.firebaseService.saveConversation(conversation);
          return;
        }
        break;

      case 'processing':
        // User is waiting for payment - check if they want a new payment link
        if (message.trim() === '1') {
          // User wants a new payment link
          const orders = await this.firebaseService.getOrdersByPhone(from);
          const pendingOrder = orders.find(o => o.status === 'payment_pending');

          if (pendingOrder) {
            await this.whatsappService.sendTextMessage(from, '🔄 Yeni ödeme linki oluşturuluyor...');

            // Generate new payment link
            await this.sendPaymentLink(pendingOrder);

            console.log(`💳 New payment link generated for order ${pendingOrder.id}`);
          } else {
            await this.whatsappService.sendTextMessage(
              from,
              `❌ Ödeme bekleyen sipariş bulunamadı.

Yeni sipariş için "merhaba" yazabilirsiniz.`
            );
          }
          return false; // Don't save conversation
        } else {
          // User sent a different message - inform them about waiting for payment
          await this.whatsappService.sendTextMessage(
            from,
            `⏳ *Ödemeniz bekleniyor...*

Ödeme linkini kullanarak ödemeyi tamamlayın.

💡 *Link geçersiz olduysa:*
Sadece rakam *"1"* (bir) yazın, yeni link gönderelim.

---

Yeni sipariş başlatmak için *"merhaba"* yazabilirsiniz.`
          );
          return false; // Don't save conversation
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

    // Note: cover_photo step is deprecated (no longer used in WhatsApp flow)
    // Media handling can be added here if needed for future features
  }

  /**
   * Send order confirmation
   */
  private async sendOrderConfirmation(conversation: ConversationState): Promise<void> {
    const data = conversation.data;
    // CRITICAL: Always use current config base price
    const basePrice = config.pricing.songBasePrice;

    // Recalculate discount if discount code exists (to handle cached old prices)
    let finalPrice = basePrice;
    let discountAmount = 0;

    if (conversation.discountCode) {
      // Re-validate and apply discount with CURRENT basePrice
      const discountResult = await this.discountService.validateAndApplyDiscount(
        conversation.discountCode,
        conversation.phone,
        basePrice
      );

      if (discountResult.isValid && discountResult.discountCode) {
        discountAmount = discountResult.discountAmount;
        finalPrice = discountResult.finalPrice;

        // Update conversation with fresh values
        conversation.discountAmount = discountAmount;
        conversation.finalPrice = finalPrice;
      }
    }

    let pricingText = '';
    if (discountAmount > 0) {
      pricingText = `💰 *Fiyat: ${basePrice} TL*
🎁 *İndirim: -${discountAmount} TL* (${conversation.discountCode})
✨ *Toplam: ${finalPrice} TL*`;
    } else {
      pricingText = `💰 *Toplam: ${finalPrice} TL*`;
    }

    const discountPrompt = discountAmount > 0 ? '' : `

🎁 *İndirim kodunuz var mı?* Kodu yazın veya direkt onaylayın.`;

    const summary = `📋 *Sipariş Özeti*

🎵 ${data.song1?.type} | ${data.song1?.style} | ${data.song1?.vocal}
👤 ${data.recipientRelation}${data.includeNameInSong ? ` (${data.recipientName})` : ''}

${pricingText}

⏰ 2 saat teslimat${discountPrompt}

1️⃣ Onayla
2️⃣ İptal

---
💡 İptal etmek için *"iptal"* yazın.`;

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

      // CRITICAL: Always use current config base price
      const pricing = this.calculatePriceDetails(orderRequest.deliveryOptions);

      // Recalculate discount with current basePrice (handle cached old values)
      let finalPrice = pricing.totalPrice;
      let discountAmount = 0;

      if (conversation.discountCode) {
        // Re-validate and apply discount with CURRENT basePrice
        const discountResult = await this.discountService.validateAndApplyDiscount(
          conversation.discountCode,
          conversation.phone,
          pricing.totalPrice
        );

        if (discountResult.isValid && discountResult.discountCode) {
          discountAmount = discountResult.discountAmount;
          finalPrice = discountResult.finalPrice;
        }
      }

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

      // Log analytics
      await this.firebaseService.logAnalytics('order_created', {
        orderId,
        phone: conversation.phone,
        totalPrice: order.totalPrice,
      });

      // Check if order is free (0 TL) - skip payment and delete conversation immediately
      if (order.totalPrice === 0) {
        console.log(`🎁 Free order detected (100% discount) - skipping payment for ${orderId}`);

        // Send confirmation
        await this.whatsappService.sendTextMessage(
          conversation.phone,
          `🎉 *Siparişiniz Onaylandı!*

🎵 Sipariş No: ${orderId}
💰 Tutar: 0 TL (Hediyemiz olsun! 🎁)

Şarkınızın hazırlanmasına başlıyoruz! 2 saat içinde teslim edilecek.

Teşekkür ederiz! ❤️`
        );

        // Clean up conversation immediately (allow new orders)
        await this.firebaseService.deleteConversation(conversation.phone);
        console.log(`🗑️ Conversation deleted for ${conversation.phone} (0 TL order)`);

        // Update order status to 'paid' (no payment needed, just mark as ready to process)
        await this.firebaseService.updateOrder(orderId, {
          status: 'paid',
          paidAt: new Date(),
        });

        // Log analytics: free order completed (no payment)
        await this.firebaseService.logAnalytics('free_order_processing', {
          orderId,
          phone: conversation.phone,
          discountCode: conversation.discountCode,
          timestamp: new Date().toISOString(),
        });

        // Generate lyrics and show to user for review (same as paid orders, but with free message)
        await this.generateAndShowLyrics(orderId);

        return;
      }

      // For paid orders, set to processing step and save conversation
      conversation.step = 'processing';
      await this.firebaseService.saveConversation(conversation);

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

        // Delete conversation immediately if payment system failed
        await this.firebaseService.deleteConversation(conversation.phone);
        console.log(`🗑️ Conversation deleted for ${conversation.phone} (payment system not configured)`);
      }

      // IMPORTANT: Do NOT delete conversation here - user needs to stay in "processing" state
      // Conversation will be deleted when:
      // 1. Payment succeeds and lyrics are approved (order.service.ts:247, 270)
      // 2. Music generation completes (firebase-queue.service.ts:447)
      // 3. Order fails after max retries (firebase-queue.service.ts:498)

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

      // Clean and prepare payment data (remove Turkish characters)
      const cleanText = (text: string): string => {
        return text
          .replace(/ğ/g, 'g')
          .replace(/Ğ/g, 'G')
          .replace(/ü/g, 'u')
          .replace(/Ü/g, 'U')
          .replace(/ş/g, 's')
          .replace(/Ş/g, 'S')
          .replace(/ı/g, 'i')
          .replace(/İ/g, 'I')
          .replace(/ö/g, 'o')
          .replace(/Ö/g, 'O')
          .replace(/ç/g, 'c')
          .replace(/Ç/g, 'C')
          .replace(/[^a-zA-Z0-9\s]/g, ''); // Remove special characters
      };

      const recipientName = order.orderData.recipientName
        ? cleanText(order.orderData.recipientName)
        : 'Musteri';

      // Use phone number for email to ensure it's always valid
      const phoneClean = order.whatsappPhone.replace(/[^0-9]/g, ''); // Remove non-numeric chars
      const userEmail = `${phoneClean}@bihediye.art`;

      // Clean song type for basket
      const songTypeClean = cleanText(order.orderData.song1.type);

      console.log('📝 PayTR request data:', {
        orderId: order.id,
        email: userEmail,
        amount: order.totalPrice,
        userName: recipientName,
        userPhone: order.whatsappPhone,
        basketItem: `${songTypeClean} Sarki Hediyesi`,
      });

      // Ödeme token oluştur
      const tokenResponse = await this.paytrService.createPaymentToken(
        {
          orderId: order.id,
          email: userEmail,
          amount: order.totalPrice,
          userIp: '85.34.0.1', // WhatsApp kullanıcısı için varsayılan IP
          userName: recipientName,
          userPhone: order.whatsappPhone,
          basketItems: [
            {
              name: `${songTypeClean} Sarki Hediyesi`,
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

Ödeme tamamlandıktan sonra şarkınızın hazırlanmasına başlanacaktır!

---

💡 *Link geçersiz olduysa:*
Sadece rakam *"1"* (bir) yazın, yeni link gönderelim.`
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

      // Check if this is a WhatsApp order or web order (web orders use email as phone)
      const isWebOrder = order.whatsappPhone.includes('@');

      // For web orders, skip lyrics review and start processing directly
      if (isWebOrder) {
        console.log(`📱 Web order detected - skipping WhatsApp notifications for ${orderId}`);
        await this.processOrder(orderId);
      } else {
        // Generate lyrics and show to user (WhatsApp only)
        await this.generateAndShowLyrics(orderId);
      }

      console.log(`✅ Payment processed for order ${orderId}`);
    } catch (error: any) {
      console.error('Error handling payment success:', error);
      throw error;
    }
  }

  /**
   * Generate lyrics and show to user for review (with 2 revision rights)
   */
  private async generateAndShowLyrics(orderId: string): Promise<void> {
    const order = await this.firebaseService.getOrder(orderId);
    if (!order) return;

    try {
      // Generate lyrics
      order.status = 'lyrics_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'lyrics_generating' });

      // Different message for free vs paid orders
      const isFreeOrder = order.totalPrice === 0;
      const statusMessage = isFreeOrder
        ? `🎁 *Sipariş Onaylandı!*

🎵 Sipariş No: ${orderId}
💰 0 TL (Hediyemiz olsun! 🎁)

Şarkı sözleriniz yazılıyor... ⏳`
        : `✅ *Ödeme Başarılı!*

🎵 Sipariş No: ${orderId}
💰 ${order.totalPrice} TL

Şarkı sözleriniz yazılıyor... ⏳`;

      await this.whatsappService.sendTextMessage(order.whatsappPhone, statusMessage);

      const lyricsRequest = {
        songDetails: order.orderData.song1,
        story: order.orderData.story,
        recipientName: order.orderData.recipientName,
        recipientRelation: order.orderData.recipientRelation,
        includeNameInSong: order.orderData.includeNameInSong,
        notes: order.orderData.notes,
      };

      const lyricsResult = await this.openaiService.generateLyrics(lyricsRequest);

      // Log token usage
      if (lyricsResult.tokenUsage) {
        await this.firebaseService.logAnalytics('openai_token_usage', {
          orderId,
          phone: order.whatsappPhone,
          operation: 'lyrics_generation',
          promptTokens: lyricsResult.tokenUsage.promptTokens,
          completionTokens: lyricsResult.tokenUsage.completionTokens,
          totalTokens: lyricsResult.tokenUsage.totalTokens,
          timestamp: new Date().toISOString(),
        });
      }

      // Save lyrics to order
      await this.firebaseService.updateOrder(orderId, {
        song1Lyrics: lyricsResult.lyrics,
        song1LyricsRevisionCount: 0,
      });

      // Create conversation for lyrics review
      const conversation: ConversationState = {
        phone: order.whatsappPhone,
        step: 'lyrics_review_song1',
        data: order.orderData,
        lastUpdated: new Date(),
        tempLyrics: lyricsResult.lyrics,
        lyricsRevisionCount: 0,
      };
      await this.firebaseService.saveConversation(conversation);

      // Send lyrics to user
      await this.whatsappService.sendTextMessage(
        order.whatsappPhone,
        `📝 *Şarkı Sözleriniz Hazır!*

${lyricsResult.lyrics}

---

✨ *Dilerseniz şarkı sözüne revizyon verebilirsiniz. Hakkınız 2 tanedir.*

Ne yapmak istersiniz?
1️⃣ Onayla (Müzik üretimine geç)
2️⃣ Revizyon İstiyorum (Değiştirmek istediğiniz kısmı yazın)
3️⃣ Komple Ben Yazacağım (Suno AI formatında kendi sözlerinizi gönderin)

---
💡 Destek: destek@bihediye.art`
      );

      console.log(`📝 Lyrics generated and sent to user for review: ${orderId}`);
    } catch (error: any) {
      console.error('Error generating lyrics for review:', error);
      // If lyrics generation fails, continue with music generation (fallback)
      await this.processOrder(orderId);
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
   * Start music generation directly (lyrics already approved)
   * Called when user approves lyrics from review
   */
  private async startMusicGeneration(orderId: string): Promise<void> {
    const order = await this.firebaseService.getOrder(orderId);
    if (!order) return;

    try {
      // Lyrics already exist (from review), get them from order
      if (!order.song1Lyrics) {
        console.error(`No lyrics found for order ${orderId}`);
        return;
      }

      const lyricsRequest = {
        songDetails: order.orderData.song1,
        story: order.orderData.story,
        recipientName: order.orderData.recipientName,
        recipientRelation: order.orderData.recipientRelation,
        includeNameInSong: order.orderData.includeNameInSong,
        notes: order.orderData.notes,
      };

      // Synthesize music genre for Suno AI V5 (combines type + notes + artist styles)
      console.log('🎼 Synthesizing music genre for Suno AI V5...');
      const synthesizedGenre = await this.openaiService.synthesizeMusicGenre(lyricsRequest);
      console.log('✅ Synthesized genre:', synthesizedGenre);

      // Generate music using queue (async)
      order.status = 'music_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'music_generating' });

      // Log analytics: music generation started
      await this.firebaseService.logAnalytics('music_generation_started', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        synthesizedGenre,
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
            lyrics: order.song1Lyrics, // Use approved lyrics from order
            songType: synthesizedGenre, // Use synthesized genre
            style: order.orderData.song1.style,
            vocal: order.orderData.song1.vocal,
            artistStyleDescription: order.orderData.song1.artistStyleDescription,
          },
        });
        // Queue will handle the rest (music generation + delivery)
        console.log(`✅ Music generation queued for order ${orderId}`);
        return;
      } else {
        // Fallback to sync mode (for development/testing)
        console.log('⚠️ No queue service - using sync mode');
        const song1Task = await this.sunoService.generateMusic({
          lyrics: order.song1Lyrics, // Use approved lyrics
          songType: order.orderData.song1.type,
          style: order.orderData.song1.style,
          vocal: order.orderData.song1.vocal,
          artistStyleDescription: order.orderData.song1.artistStyleDescription,
        });

        const song1Music = await this.sunoService.waitForTaskCompletion(song1Task.task_id);

        order.song1AudioUrl = song1Music.file_url;
        await this.firebaseService.updateOrder(orderId, {
          song1MusicTaskId: song1Task.task_id,
          song1AudioUrl: song1Music.file_url,
        });

        await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Müzikler hazır!', 70);

        // Generate video if requested
        if (order.orderData.deliveryOptions.video) {
          order.status = 'video_generating';
          await this.firebaseService.updateOrder(orderId, { status: 'video_generating' });
          await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Video oluşturuluyor...', 80);

          const videoPrompt = await this.openaiService.generateVideoPrompt(
            order.orderData.story,
            order.orderData.song1.type
          );

          const videoTask = await this.sunoService.generateVideo({
            prompt: videoPrompt,
            imageUrl: order.orderData.coverPhoto,
          });

          const videoResult = await this.sunoService.waitForTaskCompletion(videoTask.task_id);
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
      }
    } catch (error: any) {
      console.error('Error starting music generation:', error);
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
   * Process order (same as order.routes.ts)
   */
  private async processOrder(orderId: string): Promise<void> {
    const order = await this.firebaseService.getOrder(orderId);
    if (!order) return;

    // Check if this is a web order
    const isWebOrder = order.whatsappPhone.includes('@');

    try {
      // Generate lyrics
      order.status = 'lyrics_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'lyrics_generating' });

      // Only send WhatsApp updates for WhatsApp orders
      if (!isWebOrder) {
        await this.whatsappService.sendProgressUpdate(order.whatsappPhone, orderId, 'Şarkı sözleri yazılıyor...', 10);
      }

      // Log analytics: lyrics generation started
      await this.firebaseService.logAnalytics('lyrics_generation_started', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        timestamp: new Date().toISOString(),
      });

      const lyricsRequest = {
        songDetails: order.orderData.song1,
        story: order.orderData.story,
        recipientName: order.orderData.recipientName,
        recipientRelation: order.orderData.recipientRelation,
        includeNameInSong: order.orderData.includeNameInSong,
        notes: order.orderData.notes,
      };

      const lyricsResult = await this.openaiService.generateLyrics(lyricsRequest);

      // Log token usage
      if (lyricsResult.tokenUsage) {
        await this.firebaseService.logAnalytics('openai_token_usage', {
          orderId,
          phone: order.whatsappPhone,
          operation: 'lyrics_generation',
          promptTokens: lyricsResult.tokenUsage.promptTokens,
          completionTokens: lyricsResult.tokenUsage.completionTokens,
          totalTokens: lyricsResult.tokenUsage.totalTokens,
          timestamp: new Date().toISOString(),
        });
      }

      order.song1Lyrics = lyricsResult.lyrics;
      await this.firebaseService.updateOrder(orderId, { song1Lyrics: lyricsResult.lyrics });

      // Synthesize music genre for Suno AI V5 (combines type + notes + artist styles)
      console.log('🎼 Synthesizing music genre for Suno AI V5...');
      const synthesizedGenre = await this.openaiService.synthesizeMusicGenre(lyricsRequest);
      console.log('✅ Synthesized genre:', synthesizedGenre);

      // Generate music using queue (async) - NO progress update here, queue handles it
      order.status = 'music_generating';
      await this.firebaseService.updateOrder(orderId, { status: 'music_generating' });

      // Log analytics: music generation started
      await this.firebaseService.logAnalytics('music_generation_started', {
        orderId,
        phone: order.whatsappPhone,
        songType: order.orderData.song1.type,
        synthesizedGenre,
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
            lyrics: lyricsResult.lyrics,
            songType: synthesizedGenre, // Use synthesized genre instead of basic type
            style: order.orderData.song1.style,
            vocal: order.orderData.song1.vocal,
            artistStyleDescription: order.orderData.song1.artistStyleDescription, // Pass artist style
          },
        });
        // Queue will handle the rest (music generation + delivery)
        return;
      } else {
        // Fallback to sync mode (for development/testing)
        console.log('⚠️ No queue service - using sync mode');
        const song1Task = await this.sunoService.generateMusic({
          lyrics: lyricsResult.lyrics,
          songType: order.orderData.song1.type,
          style: order.orderData.song1.style,
          vocal: order.orderData.song1.vocal,
          artistStyleDescription: order.orderData.song1.artistStyleDescription, // Pass artist style
        });

        const song1Music = await this.sunoService.waitForTaskCompletion(song1Task.task_id);

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

        const videoTask = await this.sunoService.generateVideo({
          prompt: videoPrompt,
          imageUrl: order.orderData.coverPhoto,
        });

        const videoResult = await this.sunoService.waitForTaskCompletion(videoTask.task_id);
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

  /**
   * Create order from web (no WhatsApp conversation)
   * For mobile/web app users
   */
  async createWebOrder(orderRequest: OrderRequest, userId: string, userEmail: string): Promise<{
    orderId: string;
    paymentUrl: string;
    totalPrice: number;
    discountApplied: number;
    finalPrice: number;
  }> {
    try {
      const orderId = uuidv4().replace(/-/g, '');

      // Calculate pricing
      const pricing = this.calculatePriceDetails(orderRequest.deliveryOptions);

      // Create order
      const order: Order = {
        id: orderId,
        whatsappPhone: orderRequest.phone || userEmail,
        orderData: orderRequest,
        status: 'payment_pending',
        basePrice: pricing.basePrice,
        additionalCosts: pricing.additionalCosts,
        totalPrice: pricing.totalPrice,
        createdAt: new Date(),
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      // Save order
      await this.firebaseService.saveOrder(order);

      // Log analytics
      await this.firebaseService.logAnalytics('order_created_web', {
        orderId,
        userId,
        userEmail,
        totalPrice: order.totalPrice,
        timestamp: new Date().toISOString(),
      });

      // Generate payment link
      if (!this.paytrService) {
        throw new Error('Payment system not configured');
      }

      const baseUrl = process.env.BASE_URL || 'https://bihediye.art';

      const cleanText = (text: string): string => {
        return text
          .replace(/ğ/g, 'g')
          .replace(/Ğ/g, 'G')
          .replace(/ü/g, 'u')
          .replace(/Ü/g, 'U')
          .replace(/ş/g, 's')
          .replace(/Ş/g, 'S')
          .replace(/ı/g, 'i')
          .replace(/İ/g, 'I')
          .replace(/ö/g, 'o')
          .replace(/Ö/g, 'O')
          .replace(/ç/g, 'c')
          .replace(/Ç/g, 'C')
          .replace(/[^a-zA-Z0-9\s]/g, '');
      };

      const recipientName = order.orderData.recipientName
        ? cleanText(order.orderData.recipientName)
        : 'Musteri';

      const songTypeClean = cleanText(order.orderData.song1.type);

      const tokenResponse = await this.paytrService.createPaymentToken(
        {
          orderId: order.id,
          email: userEmail,
          amount: order.totalPrice,
          userIp: '85.34.0.1',
          userName: recipientName,
          userPhone: order.whatsappPhone,
          basketItems: [
            {
              name: `${songTypeClean} Sarki Hediyesi`,
              price: order.totalPrice,
              quantity: 1,
            },
          ],
        },
        `${baseUrl}/payment/success?orderId=${order.id}`,
        `${baseUrl}/payment/fail?orderId=${order.id}`
      );

      if (tokenResponse.status !== 'success' || !tokenResponse.token) {
        throw new Error(`Payment token creation failed: ${tokenResponse.reason || 'Unknown'}`);
      }

      // Store payment token
      await this.firebaseService.updateOrder(orderId, {
        paymentToken: tokenResponse.token,
      });

      const paymentUrl = `${baseUrl}/payment/${order.id}`;

      return {
        orderId,
        paymentUrl,
        totalPrice: order.totalPrice,
        discountApplied: 0,
        finalPrice: order.totalPrice,
      };
    } catch (error: any) {
      console.error('Error creating web order:', error);
      throw error;
    }
  }
}
