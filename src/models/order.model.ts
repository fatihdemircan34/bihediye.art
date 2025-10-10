export interface SongDetails {
  type: 'Pop' | 'Rap' | 'Jazz' | 'Arabesk' | 'Klasik' | 'Rock' | 'Metal' | 'Nostaljik';
  style: 'Romantik' | 'Duygusal' | 'Eğlenceli' | 'Sakin';
  vocal?: 'Kadın' | 'Erkek' | 'Fark etmez';
}

export interface DeliveryOption {
  audioFile: boolean;           // Ses Dosyası ile Teslim
  musicPlatform: boolean;        // Müzik Platformu ile Teslim (SoundCloud) - +79 TL
  video: boolean;                // Video ile Teslim - +79 TL
}

export interface OrderRequest {
  // Şarkı 1 Bilgileri
  song1: SongDetails;

  // Şarkı 2 Bilgileri
  song2: SongDetails;

  // Hediye Bilgileri
  recipientRelation?: string;          // Hediye edilecek kişi neyinizdir (anne, baba, sevgili, vs.)
  includeNameInSong: boolean;          // Şarkıda isim geçsin mi?
  recipientName?: string;              // Şarkı kime yapılıyor (isim geçecekse)

  // Şarkı İçeriği
  story: string;                       // Şarkının hikayesi/hisler (max 900 karakter)
  notes?: string;                      // Şarkı için notlar (max 300 karakter)

  // İletişim ve Teslimat
  phone: string;                       // Teslim edilecek telefon numarası
  deliveryOptions: DeliveryOption;     // Teslimat seçenekleri

  // Fotoğraf (Video seçildiyse zorunlu)
  coverPhoto?: string;                 // Fotoğraf base64 veya URL
}

export interface Order {
  id: string;
  whatsappPhone: string;               // Sipariş veren WhatsApp numarası
  orderData: OrderRequest;

  // İşlem Durumları
  status: 'payment_pending' | 'paid' | 'pending' | 'lyrics_generating' | 'music_generating' | 'video_generating' | 'completed' | 'failed';

  // AI Task ID'leri
  song1LyricsTaskId?: string;
  song2LyricsTaskId?: string;
  song1MusicTaskId?: string;
  song2MusicTaskId?: string;
  videoTaskId?: string;

  // Sonuç Dosyaları
  song1Lyrics?: string;
  song2Lyrics?: string;
  song1AudioUrl?: string;
  song2AudioUrl?: string;
  videoUrl?: string;
  soundcloudUrl?: string;

  // Fiyatlandırma
  basePrice: number;
  additionalCosts: number;
  totalPrice: number;

  // Tarihler
  createdAt: Date;
  completedAt?: Date;
  estimatedDelivery?: Date;
  paidAt?: Date;

  // Ödeme Bilgileri
  paymentToken?: string;
  paymentTransactionId?: string;

  // Notlar
  errorMessage?: string;
}

export interface OrderResponse {
  orderId: string;
  status: string;
  message: string;
  totalPrice: number;
  estimatedDelivery: Date;
}

export interface OrderStatus {
  orderId: string;
  status: string;
  progress: {
    song1Lyrics: boolean;
    song2Lyrics: boolean;
    song1Music: boolean;
    song2Music: boolean;
    video: boolean;
  };
  completionPercentage: number;
  estimatedTimeRemaining?: number;  // dakika cinsinden
}
