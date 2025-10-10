import axios from 'axios';
import * as crypto from 'crypto';

export interface PaytrConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: boolean;
}

export interface PaymentRequest {
  orderId: string;
  email: string;
  amount: number; // TL cinsinden (otomatik kuruşa çevrilecek)
  userIp: string;
  userName: string;
  userPhone: string;
  basketItems: Array<{
    name: string;
    price: number; // TL cinsinden
    quantity: number;
  }>;
}

export interface PaymentTokenResponse {
  status: 'success' | 'failed';
  token?: string;
  reason?: string;
}

export interface PaytrCallback {
  merchant_oid: string;
  status: 'success' | 'failed';
  total_amount: string; // Kuruş cinsinden
  hash: string;
  failed_reason_code?: string;
  failed_reason_msg?: string;
  payment_type?: string;
  currency?: string;
  payment_amount?: string;
  installment_count?: string;
}

export class PaytrService {
  private merchantId: string;
  private merchantKey: string;
  private merchantSalt: string;
  private testMode: boolean;
  private apiUrl = 'https://www.paytr.com/odeme/api/get-token';

  constructor(config: PaytrConfig) {
    this.merchantId = config.merchantId;
    this.merchantKey = config.merchantKey;
    this.merchantSalt = config.merchantSalt;
    this.testMode = config.testMode;

    console.log('✅ PayTR initialized:', {
      merchantId: this.merchantId,
      testMode: this.testMode,
    });
  }

  /**
   * Ödeme token'ı oluştur
   */
  async createPaymentToken(
    paymentRequest: PaymentRequest,
    successUrl: string,
    failUrl: string
  ): Promise<PaymentTokenResponse> {
    try {
      // Tutarı kuruşa çevir
      const paymentAmount = Math.round(paymentRequest.amount * 100);

      // Sepet bilgisini hazırla
      const userBasket = this.prepareUserBasket(paymentRequest.basketItems);
      const userBasketBase64 = Buffer.from(JSON.stringify(userBasket)).toString('base64');

      // Hash oluştur
      const hashStr =
        this.merchantId +
        paymentRequest.userIp +
        paymentRequest.orderId +
        paymentRequest.email +
        paymentAmount +
        userBasketBase64 +
        '1' + // no_installment (taksit kapalı)
        '0' + // max_installment
        'TL' + // currency
        (this.testMode ? '1' : '0') + // test_mode
        this.merchantSalt;

      const paytrToken = this.createHash(hashStr, this.merchantKey);

      console.log('📝 PayTR token request:', {
        orderId: paymentRequest.orderId,
        amount: paymentAmount,
        testMode: this.testMode,
      });

      // API isteği
      const params = new URLSearchParams({
        merchant_id: this.merchantId,
        user_ip: paymentRequest.userIp,
        merchant_oid: paymentRequest.orderId,
        email: paymentRequest.email,
        payment_amount: paymentAmount.toString(),
        paytr_token: paytrToken,
        user_basket: userBasketBase64,
        debug_on: this.testMode ? '1' : '0',
        no_installment: '1', // Taksit kapalı
        max_installment: '0',
        user_name: paymentRequest.userName,
        user_address: 'N/A',
        user_phone: paymentRequest.userPhone,
        merchant_ok_url: successUrl,
        merchant_fail_url: failUrl,
        timeout_limit: '30', // 30 dakika
        currency: 'TL',
        test_mode: this.testMode ? '1' : '0',
        lang: 'tr',
      });

      const response = await axios.post(this.apiUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      console.log('✅ PayTR token response:', response.data);

      return response.data;
    } catch (error: any) {
      console.error('❌ PayTR token error:', error.response?.data || error.message);
      throw new Error(`PayTR token oluşturma hatası: ${error.message}`);
    }
  }

  /**
   * Callback hash'i doğrula
   */
  verifyCallback(callback: PaytrCallback): boolean {
    try {
      const hashStr = callback.merchant_oid + this.merchantSalt + callback.status + callback.total_amount;
      const calculatedHash = crypto
        .createHmac('sha256', this.merchantKey)
        .update(hashStr)
        .digest('base64');

      const isValid = calculatedHash === callback.hash;

      if (!isValid) {
        console.error('❌ PayTR callback hash mismatch:', {
          received: callback.hash,
          calculated: calculatedHash,
        });
      } else {
        console.log('✅ PayTR callback hash verified:', {
          orderId: callback.merchant_oid,
          status: callback.status,
        });
      }

      return isValid;
    } catch (error: any) {
      console.error('❌ PayTR callback verification error:', error.message);
      return false;
    }
  }

  /**
   * Ödeme iframe URL'i oluştur
   */
  getIframeUrl(token: string): string {
    return `https://www.paytr.com/odeme/guvenli/${token}`;
  }

  /**
   * Sepet bilgisini hazırla
   */
  private prepareUserBasket(items: Array<{ name: string; price: number; quantity: number }>): Array<any> {
    return items.map(item => [
      item.name,
      (item.price * 100).toString(), // Kuruşa çevir
      item.quantity,
    ]);
  }

  /**
   * HMAC SHA256 hash oluştur
   */
  private createHash(data: string, key: string): string {
    return crypto.createHmac('sha256', key).update(data).digest('base64');
  }

  /**
   * Test modu kontrolü
   */
  isTestMode(): boolean {
    return this.testMode;
  }

  /**
   * Ödeme başarılı mı kontrol et
   */
  isPaymentSuccessful(callback: PaytrCallback): boolean {
    return callback.status === 'success';
  }

  /**
   * Ödeme tutarını TL'ye çevir
   */
  convertToTL(amountInKurus: string): number {
    return parseInt(amountInKurus) / 100;
  }
}
