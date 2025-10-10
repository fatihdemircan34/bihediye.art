import { v4 as uuidv4 } from 'uuid';
import { DiscountCode, DiscountUsage } from '../models/discount.model';
import { FirebaseService } from './firebase.service';

export class DiscountService {
  constructor(private firebaseService: FirebaseService) {}

  /**
   * İndirim kodu oluştur
   */
  async createDiscountCode(data: Omit<DiscountCode, 'id' | 'usedCount' | 'createdAt'>): Promise<DiscountCode> {
    const discountCode: DiscountCode = {
      id: uuidv4(),
      ...data,
      code: data.code.toUpperCase(), // Büyük harfe çevir
      usedCount: 0,
      createdAt: new Date(),
    };

    await this.firebaseService.saveDiscountCode(discountCode);
    console.log(`✅ Discount code created: ${discountCode.code}`);
    return discountCode;
  }

  /**
   * İndirim kodunu doğrula ve uygula
   */
  async validateAndApplyDiscount(
    code: string,
    phone: string,
    originalPrice: number
  ): Promise<{ isValid: boolean; discountAmount: number; finalPrice: number; message: string; discountCode?: DiscountCode }> {
    const discountCode = await this.firebaseService.getDiscountCodeByCode(code.toUpperCase());

    // Kod bulunamadı
    if (!discountCode) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Geçersiz indirim kodu',
      };
    }

    // Aktif değil
    if (!discountCode.isActive) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Bu indirim kodu artık geçerli değil',
      };
    }

    // Tarih kontrolü
    const now = new Date();
    if (discountCode.validFrom && new Date(discountCode.validFrom) > now) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Bu indirim kodu henüz geçerli değil',
      };
    }

    if (discountCode.validUntil && new Date(discountCode.validUntil) < now) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Bu indirim kodunun süresi dolmuş',
      };
    }

    // Kullanım limiti kontrolü
    if (discountCode.maxUses && discountCode.usedCount >= discountCode.maxUses) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Bu indirim kodu kullanım limitine ulaşmış',
      };
    }

    // Minimum tutar kontrolü
    if (discountCode.minOrderAmount && originalPrice < discountCode.minOrderAmount) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: `❌ Minimum sipariş tutarı ${discountCode.minOrderAmount} TL olmalı`,
      };
    }

    // Telefon kısıtlaması kontrolü
    if (discountCode.allowedPhones && !discountCode.allowedPhones.includes(phone)) {
      return {
        isValid: false,
        discountAmount: 0,
        finalPrice: originalPrice,
        message: '❌ Bu indirim kodu sizin için geçerli değil',
      };
    }

    // İndirim hesaplama
    let discountAmount = 0;
    if (discountCode.type === 'percentage') {
      discountAmount = Math.round((originalPrice * discountCode.value) / 100);
    } else {
      discountAmount = discountCode.value;
    }

    // İndirim tutarı orijinal fiyatı geçemez
    if (discountAmount > originalPrice) {
      discountAmount = originalPrice;
    }

    const finalPrice = originalPrice - discountAmount;

    return {
      isValid: true,
      discountAmount,
      finalPrice,
      message: `✅ ${discountCode.code} kodu uygulandı! ${discountAmount} TL indirim`,
      discountCode,
    };
  }

  /**
   * İndirim kullanımını kaydet
   */
  async recordDiscountUsage(
    discountCodeId: string,
    orderId: string,
    phone: string,
    discountAmount: number,
    originalPrice: number,
    finalPrice: number
  ): Promise<void> {
    const usage: DiscountUsage = {
      id: uuidv4(),
      discountCodeId,
      orderId,
      phone,
      discountAmount,
      originalPrice,
      finalPrice,
      usedAt: new Date(),
    };

    await this.firebaseService.saveDiscountUsage(usage);

    // İndirim kodunun kullanım sayısını artır
    await this.firebaseService.incrementDiscountUsage(discountCodeId);

    console.log(`✅ Discount usage recorded for order ${orderId}`);
  }

  /**
   * Tüm indirim kodlarını getir
   */
  async getAllDiscountCodes(): Promise<DiscountCode[]> {
    return await this.firebaseService.getAllDiscountCodes();
  }

  /**
   * İndirim kodunu güncelle
   */
  async updateDiscountCode(id: string, updates: Partial<DiscountCode>): Promise<void> {
    await this.firebaseService.updateDiscountCode(id, updates);
    console.log(`✅ Discount code updated: ${id}`);
  }

  /**
   * İndirim kodunu sil
   */
  async deleteDiscountCode(id: string): Promise<void> {
    await this.firebaseService.deleteDiscountCode(id);
    console.log(`✅ Discount code deleted: ${id}`);
  }

  /**
   * İndirim istatistikleri
   */
  async getDiscountStats(discountCodeId: string): Promise<{
    totalUses: number;
    totalDiscountGiven: number;
    totalRevenue: number;
  }> {
    const usages = await this.firebaseService.getDiscountUsages(discountCodeId);

    return {
      totalUses: usages.length,
      totalDiscountGiven: usages.reduce((sum, u) => sum + u.discountAmount, 0),
      totalRevenue: usages.reduce((sum, u) => sum + u.finalPrice, 0),
    };
  }
}
