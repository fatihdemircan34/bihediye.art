import axios, { AxiosInstance } from 'axios';

export interface WhatsAppConfig {
  accessKey: string;
  workspaceId?: string;
  channelId?: string;
  apiVersion?: string;
}

export interface BirdMessage {
  receiver: {
    contacts: Array<{
      identifierValue: string;
      identifierKey?: string;
    }>;
  };
  body: {
    type: 'text' | 'media' | 'hsm';
    text?: {
      text: string;
    };
    media?: {
      url: string;
      mediaType?: 'image' | 'audio' | 'video' | 'document';
      caption?: string;
      fileName?: string;
    };
  };
}

export class WhatsAppService {
  private client: AxiosInstance;
  private workspaceId?: string;
  private channelId?: string;

  constructor(config: WhatsAppConfig) {
    this.workspaceId = config.workspaceId;
    this.channelId = config.channelId;

    this.client = axios.create({
      baseURL: 'https://api.bird.com',
      headers: {
        'Authorization': `AccessKey ${config.accessKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Send a text message via Bird.com WhatsApp
   */
  async sendTextMessage(to: string, message: string): Promise<void> {
    try {
      const payload: BirdMessage = {
        receiver: {
          contacts: [
            {
              identifierValue: this.formatPhoneNumber(to),
              identifierKey: 'phonenumber',
            },
          ],
        },
        body: {
          type: 'text',
          text: {
            text: message,
          },
        },
      };

      await this.sendMessage(payload);
    } catch (error: any) {
      console.error('Error sending text message:', error.response?.data || error.message);
      throw new Error(`WhatsApp mesaj gönderme hatası: ${error.message}`);
    }
  }

  /**
   * Send an audio file
   */
  async sendAudioMessage(to: string, audioUrl: string): Promise<void> {
    try {
      const payload: BirdMessage = {
        receiver: {
          contacts: [
            {
              identifierValue: this.formatPhoneNumber(to),
              identifierKey: 'phonenumber',
            },
          ],
        },
        body: {
          type: 'media',
          media: {
            url: audioUrl,
            mediaType: 'audio',
          },
        },
      };

      await this.sendMessage(payload);
    } catch (error: any) {
      console.error('Error sending audio message:', error.response?.data || error.message);
      throw new Error(`WhatsApp ses gönderme hatası: ${error.message}`);
    }
  }

  /**
   * Send a video file
   */
  async sendVideoMessage(to: string, videoUrl: string, caption?: string): Promise<void> {
    try {
      const payload: BirdMessage = {
        receiver: {
          contacts: [
            {
              identifierValue: this.formatPhoneNumber(to),
              identifierKey: 'phonenumber',
            },
          ],
        },
        body: {
          type: 'media',
          media: {
            url: videoUrl,
            mediaType: 'video',
            caption: caption,
          },
        },
      };

      await this.sendMessage(payload);
    } catch (error: any) {
      console.error('Error sending video message:', error.response?.data || error.message);
      throw new Error(`WhatsApp video gönderme hatası: ${error.message}`);
    }
  }

  /**
   * Send an image file
   */
  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<void> {
    try {
      const payload: BirdMessage = {
        receiver: {
          contacts: [
            {
              identifierValue: this.formatPhoneNumber(to),
              identifierKey: 'phonenumber',
            },
          ],
        },
        body: {
          type: 'media',
          media: {
            url: imageUrl,
            mediaType: 'image',
            caption: caption,
          },
        },
      };

      await this.sendMessage(payload);
    } catch (error: any) {
      console.error('Error sending image message:', error.response?.data || error.message);
      throw new Error(`WhatsApp görsel gönderme hatası: ${error.message}`);
    }
  }

  /**
   * Send a document file
   */
  async sendDocumentMessage(to: string, documentUrl: string, filename: string): Promise<void> {
    try {
      const payload: BirdMessage = {
        receiver: {
          contacts: [
            {
              identifierValue: this.formatPhoneNumber(to),
              identifierKey: 'phonenumber',
            },
          ],
        },
        body: {
          type: 'media',
          media: {
            url: documentUrl,
            mediaType: 'document',
            fileName: filename,
          },
        },
      };

      await this.sendMessage(payload);
    } catch (error: any) {
      console.error('Error sending document message:', error.response?.data || error.message);
      throw new Error(`WhatsApp dosya gönderme hatası: ${error.message}`);
    }
  }

  /**
   * Send order confirmation message
   */
  async sendOrderConfirmation(
    to: string,
    orderId: string,
    totalPrice: number,
    estimatedDelivery: Date
  ): Promise<void> {
    const message = `✅ *Siparişiniz Alındı!*

🎵 Sipariş No: ${orderId}
💰 Toplam Tutar: ${totalPrice.toFixed(2)} TL
⏰ Tahmini Teslimat: ${estimatedDelivery.toLocaleString('tr-TR')}

Siparişiniz işleme alınmıştır. Şarkılarınız hazırlandıktan sonra size iletilecektir.

Mesai saatlerinde 2 saat içerisinde teslim edilecektir!

Teşekkür ederiz! 🎁`;

    await this.sendTextMessage(to, message);
  }

  /**
   * Send order progress update
   */
  async sendProgressUpdate(to: string, orderId: string, status: string, progress: number): Promise<void> {
    const progressBar = this.createProgressBar(progress);

    const message = `⏳ *Sipariş Durumu*

🎵 Sipariş No: ${orderId}
📊 İlerleme: ${progressBar} ${progress}%
💬 Durum: ${status}

Şarkılarınız hazırlanıyor, lütfen bekleyin...`;

    await this.sendTextMessage(to, message);
  }

  /**
   * Send order completion message
   */
  async sendOrderCompletion(to: string, orderId: string): Promise<void> {
    const message = `🎉 *Siparişiniz Hazır!*

🎵 Sipariş No: ${orderId}

Şarkılarınız ve videolarınız hazır! Aşağıda dosyalarınızı bulabilirsiniz.

Hediyeniz için teşekkür ederiz! ❤️`;

    await this.sendTextMessage(to, message);
  }

  /**
   * Send error message (user-friendly, no technical details)
   */
  async sendErrorMessage(to: string, orderId: string, errorMessage: string): Promise<void> {
    const message = `⚠️ *Sipariş İşlemi*

🎵 Sipariş No: ${orderId}

Maalesef siparişiniz şu anda işlenemiyor.

📞 Lütfen destek ekibimizle iletişime geçin:
support@bihediye.art

Anlayışınız için teşekkür ederiz.`;

    await this.sendTextMessage(to, message);
  }

  /**
   * Generic send message method for Bird.com
   */
  private async sendMessage(payload: BirdMessage): Promise<void> {
    try {
      const endpoint = this.workspaceId && this.channelId
        ? `/workspaces/${this.workspaceId}/channels/${this.channelId}/messages`
        : '/messages';

      const response = await this.client.post(endpoint, payload);

      console.log('Bird.com WhatsApp message sent:', {
        messageId: response.data.id,
        status: response.data.status,
      });
    } catch (error: any) {
      console.error('Bird.com API error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a text-based progress bar
   */
  private createProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format phone number for Bird.com (international format)
   */
  private formatPhoneNumber(phone: string): string {
    // Remove spaces and special characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    if (cleaned.startsWith('+')) {
      return cleaned;
    } else if (cleaned.startsWith('90')) {
      return '+' + cleaned;
    } else if (cleaned.startsWith('0')) {
      return '+9' + cleaned;
    } else {
      return '+90' + cleaned;
    }
  }

  /**
   * Validate phone number format (Turkish)
   */
  static validatePhoneNumber(phone: string): boolean {
    // Remove spaces and special characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Turkish phone number patterns
    // Starts with +90 or 90 or 0, followed by 10 digits
    const patterns = [
      /^\+90\d{10}$/,      // +905551234567
      /^90\d{10}$/,        // 905551234567
      /^0\d{10}$/,         // 05551234567
    ];

    return patterns.some(pattern => pattern.test(cleaned));
  }

  /**
   * Format phone number to international format (static helper)
   */
  static formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    if (cleaned.startsWith('+90')) {
      return cleaned;
    } else if (cleaned.startsWith('90')) {
      return '+' + cleaned;
    } else if (cleaned.startsWith('0')) {
      return '+9' + cleaned;
    } else {
      return '+90' + cleaned;
    }
  }
}
