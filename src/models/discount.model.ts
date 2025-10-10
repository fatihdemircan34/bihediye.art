export interface DiscountCode {
  id: string;
  code: string; // İndirim kodu (örn: "YILBASI2024")
  type: 'percentage' | 'fixed'; // Yüzde veya sabit tutar
  value: number; // İndirim değeri (% ise 10, 20 vb. / TL ise 50, 100 vb.)

  // Kullanım Kuralları
  maxUses?: number; // Maksimum kullanım sayısı (null = sınırsız)
  usedCount: number; // Şu ana kadar kullanıldı
  minOrderAmount?: number; // Minimum sipariş tutarı

  // Geçerlilik
  validFrom: Date; // Başlangıç tarihi
  validUntil?: Date; // Bitiş tarihi (null = süresiz)
  isActive: boolean; // Aktif mi?

  // Müşteri Kısıtlaması
  allowedPhones?: string[]; // Sadece belirli telefonlar (null = herkese açık)

  // Metadata
  description?: string; // İndirim açıklaması
  createdAt: Date;
  createdBy?: string; // Admin kullanıcı adı
}

export interface DiscountUsage {
  id: string;
  discountCodeId: string;
  orderId: string;
  phone: string;
  discountAmount: number; // Uygulanan indirim tutarı (TL)
  originalPrice: number; // Orijinal fiyat
  finalPrice: number; // İndirimli fiyat
  usedAt: Date;
}
